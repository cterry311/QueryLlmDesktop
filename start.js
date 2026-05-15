const { spawn } = require('child_process');

const root = spawn("docker", ["compose", "up"], {
    shell: true
})

const backend = spawn("node", ["index.js"], {
    cwd: "BackEnd",
    shell: true
})

const frontend = spawn("npm", ["start"], {
    cwd: "FrontEnd",
    shell: true
})


root.stdout.on("data", (data) => console.log("Docker: " + data.toString()));
root.stderr.on("data", (data) => console.error("Docker: " + data.toString()));

backend.stdout.on("data", (data) => console.log("Backend: " + data.toString()));
backend.stderr.on("data", (data) => console.error("Backend: " + data.toString()));

frontend.stdout.on("data", (data) => console.log("Frontend: " + data.toString()));
frontend.stderr.on("data", (data) => console.error("Frontend: " + data.toString()));

//"http://localhost:12434/engines/llama.cpp/v1/chat/completions"