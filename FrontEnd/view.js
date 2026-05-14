const messagesEl = document.getElementById('messages')
const composerEl = document.getElementById('composer')
const inputEl = document.getElementById('input')
const sendBtn = document.getElementById('send-btn')
const modelSelect = document.getElementById('model-select')

async function loadModels() {
    try {
        const result = await window.llm.models()
        if (!result.ok) throw new Error(result.error)
        modelSelect.innerHTML = ''
        const models = result.models.slice().sort((a, b) => {
            if (a.isFree !== b.isFree) return a.isFree ? -1 : 1
            return (a.name || a.id).localeCompare(b.name || b.id)
        })
        for (const m of models) {
            const opt = document.createElement('option')
            opt.value = m.id
            opt.textContent = `${m.isFree ? 'FREE ' : ''}${m.name || m.id}`
            opt.className = m.isFree ? 'model-free' : 'model-paid'
            modelSelect.appendChild(opt)
        }
        const defaultOpt = [...modelSelect.options].find((o) => o.value === 'openrouter/free')
        modelSelect.value = defaultOpt ? 'openrouter/free' : modelSelect.options[0]?.value || ''
    } catch (err) {
        console.error('Failed to load models:', err)
    }
}

loadModels()

const settingsBtn = document.getElementById('settings-btn')
const settingsModal = document.getElementById('settings-modal')
const settingsClose = document.getElementById('settings-close')

function addBubble(text, who, { pending = false } = {}) {
    const el = document.createElement('div')
    el.className = `bubble ${who}` + (pending ? ' pending' : '')
    el.textContent = text
    messagesEl.appendChild(el)
    messagesEl.scrollTop = messagesEl.scrollHeight
    return el
}

async function handleSend() {
    const text = inputEl.value.trim()
    if (!text) return

    addBubble(text, 'user')
    inputEl.value = ''
    sendBtn.disabled = true

    const pending = addBubble('thinking...', 'assistant', { pending: true })

    try {
        const result = await window.llm.send(text, modelSelect.value || 'openrouter/free')
        pending.classList.remove('pending')
        pending.textContent = result.ok ? result.reply : `Error: ${result.error}`
    } catch (err) {
        pending.classList.remove('pending')
        pending.textContent = `Error: ${err.message}`
    } finally {
        sendBtn.disabled = false
        inputEl.focus()
    }
}

composerEl.addEventListener('submit', (e) => {
    e.preventDefault()
    handleSend()
})

inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
    }
})

// Settings modal -------------------------------------------------------------
function openSettings() { settingsModal.classList.remove('hidden') }
function closeSettings() { settingsModal.classList.add('hidden') }

settingsBtn.addEventListener('click', openSettings)
settingsClose.addEventListener('click', closeSettings)
settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) closeSettings()
})

document.querySelectorAll('.settings-list button').forEach((btn) => {
    btn.addEventListener('click', () => {
        const key = btn.dataset.setting
        // TODO: replace these placeholders with real popups / routing.
        alert(`Settings: "${key}" — not implemented yet.`)
    })
})
