const { spawn } = require('child_process');

const backend = spawn("node", ["index.js"], {
    cwd: "BackEnd",
    shell: true
})

const frontend = spawn("npm", ["start"], {
    cwd: "FrontEnd",
    shell: true
})

backend.stdout.on("data", (data) => console.log("Backend: " + data.toString()));
backend.stderr.on("data", (data) => console.error("Backend: " + data.toString()));

frontend.stdout.on("data", (data) => console.log("Frontend: " + data.toString()));
frontend.stderr.on("data", (data) => console.error("Frontend: " + data.toString()));