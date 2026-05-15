// agent-sandbox/runner.js
const express = require('express')
const { exec } = require('child_process')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const app = express()
app.use(express.json())

app.post('/execute', async (req, res) => {
    const { code, language } = req.body

    // give each execution a unique temp file
    const id = crypto.randomUUID()
    const ext = language === 'python' ? 'py' : 'js'
    const filePath = path.join('/tmp', `${id}.${ext}`)

    try {
        // write the code to a temp file
        fs.writeFileSync(filePath, code)

        const command = language === 'python'
            ? `python3 ${filePath}`
            : `node ${filePath}`

        exec(command, { timeout: 30000 }, (error, stdout, stderr) => {
            // clean up temp file
            fs.unlinkSync(filePath)

            res.json({
                stdout: stdout || '',
                stderr: stderr || '',
                exitCode: error ? error.code ?? 1 : 0,
                timedOut: error?.killed ?? false
            })
        })

    } catch (err) {
        fs.unlinkSync(filePath)
        res.status(500).json({ error: err.message })
    }
})

app.listen(3002, () => console.log('Sandbox running on port 3002'))