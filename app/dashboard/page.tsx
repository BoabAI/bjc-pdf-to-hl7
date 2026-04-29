import { redirect } from "next/navigation";

export default function DashboardRedirect(): never {
  redirect("/log");
}
