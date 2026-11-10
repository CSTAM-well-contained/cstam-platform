import { createBrowserRouter } from "react-router";
import { AppLayout } from "@/components/layout/app-layout";
import Login from "@/pages/Login";
import Overview from "@/pages/Overview";
import Hackathons from "@/pages/Hackathons";
import HackathonDetail from "@/pages/HackathonDetail";
import Teams from "@/pages/Teams";
import IpPool from "@/pages/IpPool";
import Traffic from "@/pages/Traffic";
import Config from "@/pages/Config";
import Events from "@/pages/Events";
import RoutesPage from "@/pages/Routes";
import NotFound from "@/pages/NotFound";

export const routes = [
  { path: "/login", element: <Login /> },
  {
    path: "/",
    // AppLayout sends a visitor without a token to /login.
    element: <AppLayout />,
    children: [
      { index: true, element: <Overview /> },
      { path: "hackathons", element: <Hackathons /> },
      { path: "hackathons/:h", element: <HackathonDetail /> },
      { path: "teams", element: <Teams /> },
      { path: "ip-pool", element: <IpPool /> },
      { path: "traffic", element: <Traffic /> },
      { path: "config", element: <Config /> },
      { path: "events", element: <Events /> },
      { path: "routes", element: <RoutesPage /> },
      { path: "*", element: <NotFound /> },
    ],
  },
];

export const createRouter = () => createBrowserRouter(routes);
