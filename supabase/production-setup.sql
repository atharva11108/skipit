-- One-time bootstrap for a new Skipti project. Backend service-role access only.
-- This does not change or expose any existing application tables.
begin;
create schema if not exists skipti_private;
revoke all on schema skipti_private from public, anon, authenticated;
grant usage on schema skipti_private to service_role;

create table if not exists public.skipti_records (
  collection text not null,
  id text not null,
  document jsonb not null check (jsonb_typeof(document) = 'object'),
  primary key (collection, id)
);
alter table public.skipti_records enable row level security;
revoke all on public.skipti_records from public, anon, authenticated;
grant select, insert, update, delete on public.skipti_records to service_role;
create index if not exists skipti_owner_collection on public.skipti_records (collection, (document->>'owner_id'));
create index if not exists skipti_project_collection on public.skipti_records (collection, (document->>'project_id'));
create unique index if not exists skipti_unique_persona on public.skipti_records ((document->>'owner_id')) where collection='personas';
create unique index if not exists skipti_unique_checkpoint on public.skipti_records ((document->>'project_id'), (document->>'revision')) where collection='project_checkpoints';
create unique index if not exists skipti_unique_redeem on public.skipti_records ((document->>'redeem_hash')) where collection='temporary_grants';
create unique index if not exists skipti_unique_guest on public.skipti_records ((document->>'session_hash')) where collection='guest_sessions';
create unique index if not exists skipti_unique_mcp on public.skipti_records ((document->>'token_hash')) where collection='mcp_tokens';

create or replace function skipti_private.matches(doc jsonb, filter jsonb)
returns boolean language plpgsql immutable set search_path='' as $$
declare field text; expected jsonb; actual jsonb; op text; argument jsonb;
begin
  for field, expected in select * from jsonb_each(coalesce(filter,'{}')) loop
    actual := coalesce(doc->field, 'null'::jsonb);
    if jsonb_typeof(expected)='object' then
      for op, argument in select * from jsonb_each(expected) loop
        if op='$ne' then if actual=argument then return false; end if;
        elsif op='$in' then if not exists(select 1 from jsonb_array_elements(argument) v where v=actual) then return false; end if;
        elsif op='$gt' then if actual='null'::jsonb or not(actual>argument) then return false; end if;
        elsif op='$gte' then if actual='null'::jsonb or not(actual>=argument) then return false; end if;
        elsif op='$lt' then if actual='null'::jsonb or not(actual<argument) then return false; end if;
        elsif op='$lte' then if actual='null'::jsonb or not(actual<=argument) then return false; end if;
        else raise exception 'Unsupported filter operator';
        end if;
      end loop;
    elsif actual<>expected then return false;
    end if;
  end loop;
  return true;
end $$;

create or replace function skipti_private.apply_update(doc jsonb, patch jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare field text; val jsonb; item jsonb; arr jsonb; op text; changes jsonb;
begin
  for op, changes in select * from jsonb_each(patch) loop
    if op not in ('$set','$inc','$push','$addToSet') then raise exception 'Unsupported update operator'; end if;
    for field, val in select * from jsonb_each(changes) loop
      if op='$set' then doc := jsonb_set(doc,array[field],val,true);
      elsif op='$inc' then doc := jsonb_set(doc,array[field],to_jsonb(coalesce((doc->>field)::numeric,0)+(val#>>'{}')::numeric),true);
      elsif op='$push' then doc := jsonb_set(doc,array[field],coalesce(doc->field,'[]'::jsonb)||jsonb_build_array(val),true);
      elsif op='$addToSet' then
        arr := coalesce(doc->field,'[]'::jsonb);
        for item in select * from jsonb_array_elements(case when val ? '$each' then val->'$each' else jsonb_build_array(val) end) loop
          if not arr @> jsonb_build_array(item) then arr := arr||jsonb_build_array(item); end if;
        end loop;
        doc := jsonb_set(doc,array[field],arr,true);
      end if;
    end loop;
  end loop;
  return doc;
end $$;

create or replace function public.skipti_store(request jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare col text := request->>'collection'; op text := request->>'operation';
  query jsonb := coalesce(request->'query','{}'); row_data public.skipti_records%rowtype;
  doc jsonb; changed jsonb; identifiers jsonb := '[]'; result jsonb; counter int := 0;
  first_before jsonb; first_after jsonb; key text;
begin
  if op='ping' then perform 1 from public.skipti_records limit 1; return '{"ok":1}'; end if;
  if col not in ('account_profiles','personas','status_checks','auth_sessions','persona_entries','interview_sessions','projects','project_context_entries','project_files','project_update_proposals','project_checkpoints','temporary_grants','guest_sessions','guest_chat_messages','context_access_logs','mcp_tokens') then raise exception 'Unknown collection'; end if;
  if op='find' then
    select coalesce(jsonb_agg(t.document),'[]') into result from (
      select document from public.skipti_records where collection=col and skipti_private.matches(document,query)
      order by case when (request#>>'{order,direction}')::int=-1 then document->(request#>>'{order,field}') end desc nulls last,
               case when coalesce((request#>>'{order,direction}')::int,1)=1 then document->(request#>>'{order,field}') end asc nulls last, id
      limit greatest(1,least(coalesce((request->>'limit')::int,100),1000))
    ) t; return result;
  elsif op='count' then
    select count(*) into counter from public.skipti_records where collection=col and skipti_private.matches(document,query); return to_jsonb(counter);
  elsif op='insert' then
    for doc in select * from jsonb_array_elements(request->'documents') loop
      key := coalesce(doc->>'id',gen_random_uuid()::text);
      insert into public.skipti_records values(col,key,doc);
      identifiers := identifiers||to_jsonb(key);
    end loop; return identifiers;
  elsif op in ('update','delete') then
    -- Serialize upserts even when the desired row does not exist yet.
    if coalesce((request->>'upsert')::boolean,false) then
      perform pg_advisory_xact_lock(hashtextextended(col||query::text,0));
    end if;
    for row_data in select * from public.skipti_records where collection=col and skipti_private.matches(document,query) order by id for update loop
      if op='delete' then delete from public.skipti_records where collection=col and id=row_data.id;
      else
        changed := skipti_private.apply_update(row_data.document,request->'update');
        update public.skipti_records set document=changed where collection=col and id=row_data.id;
        if counter=0 then first_before := row_data.document; first_after := changed; end if;
      end if;
      counter := counter+1;
      exit when not coalesce((request->>'many')::boolean,false);
    end loop;
    if op='delete' then return to_jsonb(counter); end if;
    if counter=0 and coalesce((request->>'upsert')::boolean,false) then
      doc := skipti_private.apply_update(query,request->'update');
      key := coalesce(doc->>'id',doc->>'owner_id',gen_random_uuid()::text);
      insert into public.skipti_records values(col,key,doc);
      first_after := doc;
    end if;
    return jsonb_build_object('matched_count',counter,'modified_count',counter,'before',first_before,'after',first_after);
  else raise exception 'Unsupported operation';
  end if;
end $$;
revoke all on function skipti_private.matches(jsonb,jsonb) from public, anon, authenticated;
revoke all on function skipti_private.apply_update(jsonb,jsonb) from public, anon, authenticated;
revoke all on function public.skipti_store(jsonb) from public, anon, authenticated;
grant execute on function skipti_private.matches(jsonb,jsonb),skipti_private.apply_update(jsonb,jsonb),public.skipti_store(jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
