import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { LoadingBlock } from "../ui/spinner";

export function ProtectedRoute() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === "loading") return <LoadingBlock label="Checking your session…" />;
  if (status === "signed-out") return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}
