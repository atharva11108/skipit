const Help = lazy(() => import("@/pages/Help"));
import { lazy, Suspense, useEffect } from "react";
import { useLocation } from "react-router-dom";
const Recovery = lazy(() => import("@/pages/Recovery"));
import { Routes, Route } from "react-router-dom";
import Home from "@/pages/Home";
const Login = lazy(() => import("@/pages/Login"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Setup = lazy(() => import("@/pages/Setup"));
const Context = lazy(() => import("@/pages/Context"));
const Projects = lazy(() => import("@/pages/Projects"));
const ProjectDetail = lazy(() => import("@/pages/ProjectDetail"));
const ProjectHistory = lazy(() => import("@/pages/ProjectHistory"));
const Playground = lazy(() => import("@/pages/Playground"));
const Share = lazy(() => import("@/pages/Share"));
const Connect = lazy(() => import("@/pages/Connect"));
const Settings = lazy(() => import("@/pages/Settings"));
const NotFound = lazy(() => import("@/pages/NotFound"));
import { ProtectedRoute } from "@/components/ProtectedRoute";

// One <Route> per page in src/pages; BrowserRouter already wraps this in main.tsx.
export default function App() {
  const location = useLocation();
  useEffect(() => { window.scrollTo(0, 0); const name = location.pathname.split("/")[1]; document.title = name ? `${name.charAt(0).toUpperCase() + name.slice(1)} · Skipti AI` : "Skipti AI — Your context. Any AI. Temporarily."; }, [location.pathname]);
  return (
    <Suspense fallback={<main className="mx-auto max-w-4xl px-5 py-16"><p className="animate-pulse text-sm text-muted-foreground" role="status">Opening your page…</p></main>}><Routes>
      <Route path="/help" element={<Help />} />
      <Route path="/privacy" element={<Help />} />
      <Route path="/" element={<Home />} />
      <Route path="/forgot-password" element={<Recovery />} />
      <Route path="/reset-password" element={<Recovery />} />
      <Route path="/auth/callback" element={<Recovery />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Login />} />
      <Route path="/setup" element={<ProtectedRoute><Setup /></ProtectedRoute>} />
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/context" element={<ProtectedRoute><Context /></ProtectedRoute>} />
      <Route path="/projects" element={<ProtectedRoute><Projects /></ProtectedRoute>} />
      <Route path="/projects/:id" element={<ProtectedRoute><ProjectDetail /></ProtectedRoute>} />
      <Route path="/projects/:id/history" element={<ProtectedRoute><ProjectHistory /></ProtectedRoute>} />
      <Route path="/playground" element={<ProtectedRoute><Playground /></ProtectedRoute>} />
      <Route path="/share" element={<ProtectedRoute><Share /></ProtectedRoute>} />
      <Route path="/connect/:token" element={<Connect />} />
      <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
      <Route path="*" element={<NotFound />} />
    </Routes></Suspense>
  );
}
