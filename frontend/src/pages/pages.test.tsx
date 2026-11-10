import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "@/test/render";
import { ADMIN, VIEWER, http, server } from "@/test/server";

test("login: a wrong token is refused, an admin token opens the overview", async () => {
  const user = userEvent.setup();
  renderApp("/");
  const input = await screen.findByLabelText("Token");
  await user.type(input, "wrong-token-0123456789");
  await user.click(screen.getByRole("button", { name: /continue/i }));
  expect(await screen.findByText("This token is refused.")).toBeInTheDocument();

  await user.clear(input);
  await user.type(input, ADMIN);
  await user.click(screen.getByRole("button", { name: /continue/i }));
  expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
  expect(sessionStorage.getItem("cstam.token")).toBe(ADMIN);
});

test("overview: MASTER card first, with the VIP and a star, and failover buttons for an admin", async () => {
  renderApp("/", ADMIN);
  const cards = await screen.findAllByRole("heading", { level: 2, name: /^gw\d$/ });
  expect(cards.map((c) => c.textContent)).toEqual(["gw1", "gw2"]);
  expect(screen.getByText(/VIP is here/)).toBeInTheDocument();
  expect(await screen.findByRole("button", { name: /planned failover/i })).toBeInTheDocument();
});

test("viewer: read-only badge, no write controls", async () => {
  renderApp("/teams", VIEWER);
  expect(await screen.findByText("read-only")).toBeInTheDocument();
  expect(await screen.findByText("team5")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /spin up/i })).toBeNull();
  expect(screen.queryByRole("button", { name: /tear down/i })).toBeNull();
});

test("teardown needs the team name typed", async () => {
  const user = userEvent.setup();
  let deleted = 0;
  server.use(
    http.delete("/v1/teams/{id}", ({ params, response }) => {
      deleted = Number(params.id);
      return response(202).json({ id: deleted, state: "deleting" });
    }),
  );
  renderApp("/teams", ADMIN);
  const row = (await screen.findByText("team5")).closest("tr")!;
  await user.click(await within(row).findByRole("button", { name: /tear down/i }));
  const dialog = await screen.findByRole("dialog");
  const confirm = within(dialog).getByRole("button", { name: "Tear down" });
  expect(confirm).toBeDisabled();
  await user.type(within(dialog).getByRole("textbox"), "team5");
  await user.click(confirm);
  await waitFor(() => expect(deleted).toBe(12));
});

test("spin up: the form checks the name and port before sending", async () => {
  const user = userEvent.setup();
  let sent = false;
  server.use(
    http.post("/v1/hackathons/{h}/teams", ({ response }) => {
      sent = true;
      return response(202).json({ id: 20, name: "x", state: "provisioning" });
    }),
  );
  renderApp("/teams?new=1", ADMIN);
  const dialog = await screen.findByRole("dialog");
  await user.type(within(dialog).getByLabelText(/team name/i), "Bad_Name");
  const port = within(dialog).getByLabelText(/app port/i);
  await user.clear(port);
  await user.type(port, "8100");
  await user.click(within(dialog).getByRole("button", { name: /spin up/i }));
  expect(await within(dialog).findByText(/lowercase letters/)).toBeInTheDocument();
  expect(within(dialog).getByText(/80 or 8000-8099 \(ports/)).toBeInTheDocument();
  expect(sent).toBe(false);
});

test("traffic: hosts and paths from the internet are shown as text", async () => {
  const { container } = renderApp("/traffic", ADMIN);
  expect(await screen.findByText("<img src=x onerror=alert(1)>")).toBeInTheDocument();
  expect(screen.getByText("/<script>alert(1)</script>")).toBeInTheDocument();
  expect(container.querySelector("img")).toBeNull();
  expect(container.querySelector("tbody script")).toBeNull();
});

test("401 during a session goes back to the login page with the reason", async () => {
  server.use(http.get("/v1/status", ({ response }) => response(401).json({ error: "token revoked" })));
  renderApp("/", ADMIN);
  expect(await screen.findByText("Signed out: token revoked")).toBeInTheDocument();
  expect(sessionStorage.getItem("cstam.token")).toBeNull();
});

test("event detail renders as formatted JSON text", async () => {
  const user = userEvent.setup();
  renderApp("/events", ADMIN);
  await user.click(await screen.findByRole("button", { name: /team5 ready in 0.5 s/ }));
  expect(screen.getByText(/"seconds": 0.52/)).toBeInTheDocument();
});
