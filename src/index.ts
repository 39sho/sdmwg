import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import { Hono } from "hono";
import type { WSContext } from "hono/ws";

const app = new Hono();

const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

app.get("/", (c) => {
  const url = new URL(c.req.url);
  const clientScript = `
const ws = new WebSocket("wss://${url.hostname}${url.port === "" ? "" : `:${url.port}`}/ws");
ws.onmessage = async (event) => {
  const data = JSON.parse(event.data);
  await commands[data.command]();
  ws.send("done");
}
`;
  return c.text(clientScript);
});

let conections: WSContext<WebSocket>[] = [];

type State = "IDLE" | "RUNNING";
const states = new WeakMap<WSContext<WebSocket>, State>();

const run = () => {
  conections.map((ws) => {
    if (states.get(ws) === "IDLE") {
      states.set(ws, "RUNNING");
      ws.send(JSON.stringify({ command: "dance" }));
    }
  });
};

app.get(
  "/ws",
  upgradeWebSocket((c) => {
    return {
      onOpen(event, ws) {
        conections.push(ws);
        states.set(ws, "IDLE");
        console.log(`conections length: ${conections.length}`);
      },
      onMessage(event, ws) {
        console.log(`Message from client: ${event.data}`);

        if (event.data === "done") {
          states.set(ws, "IDLE");
        }
      },
      onClose: () => {
        console.log("Connection closed");
        conections = conections.filter(
          (ws) => ws.readyState !== 3 /* closed */,
        );
      },
    };
  }),
);

app.get("/run", (c) => {
  run();
  return c.text("RUNNING!");
});

const server = serve(
  {
    fetch: app.fetch,
    port: 3000,
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
  },
);

injectWebSocket(server);
