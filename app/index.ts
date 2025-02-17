import express from "express";
import http from "http";
import { Server } from "socket.io";
import socketHandler from "./socket/socket";

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());

app.get("/", (req, res) => {
  res.send(
    `<h1 style="color:red; background-color:blue; width:200px; height: 150px; padding:10px">Hello World</h1>`
  );
});

socketHandler(io);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server is up and running on port ${PORT}`));
