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
            if (a.routeId !== b.routeId) return b.routeId - a.routeId
            if (a.isFree !== b.isFree) return a.isFree ? -1 : 1
            return (a.name || a.id).localeCompare(b.name || b.id)
        })
        for (const m of models) {
            const opt = document.createElement('option')
            opt.value = m.id
            opt.routeId = m.routeId
            opt.textContent = `${m.isFree ? 'FREE ' : ''}${m.name || m.id}`
            opt.className = m.routeId !== 0 ? 'model-added' : (m.isFree ? 'model-free' : 'model-paid')
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
        pending.innerHTML = result.ok ? marked.parse(result.reply) : `Error: ${result.error}`
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
const settingsTitle = document.getElementById('settings-title')
const settingsBack = document.getElementById('settings-back')
const settingsList = document.getElementById('settings-list')
const apiView = document.getElementById('api-details-view')
const apiPairsEl = document.getElementById('api-pairs')
const apiAddPairBtn = document.getElementById('api-add-pair')
const apiSaveBtn = document.getElementById('api-save')

function showBaseSettings() {
    settingsTitle.textContent = 'Settings'
    settingsBack.classList.add('hidden')
    apiView.classList.add('hidden')
    settingsList.classList.remove('hidden')
}

function showApiDetails() {
    settingsTitle.textContent = 'API Details'
    settingsBack.classList.remove('hidden')
    settingsList.classList.add('hidden')
    apiView.classList.remove('hidden')
    if (!apiPairsEl.children.length) addPair()
}

function openSettings() {
    showBaseSettings()
    settingsModal.classList.remove('hidden')
}
function closeSettings() { settingsModal.classList.add('hidden') }

settingsBtn.addEventListener('click', openSettings)
settingsClose.addEventListener('click', closeSettings)
settingsBack.addEventListener('click', showBaseSettings)
settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) closeSettings()
})

document.querySelectorAll('#settings-list button').forEach((btn) => {
    btn.addEventListener('click', () => {
        const key = btn.dataset.setting
        if (key === 'api') {
            showApiDetails()
        } else {
            alert(`Settings: "${key}" — not implemented yet.`)
        }
    })
})

// API Details ---------------------------------------------------------------
function addModelRow(modelsContainer, value = '') {
    const row = document.createElement('div')
    row.className = 'api-model-row'

    const input = document.createElement('input')
    input.type = 'text'
    input.className = 'api-model-input'
    input.placeholder = 'Model ID'
    input.value = value

    const removeBtn = document.createElement('button')
    removeBtn.type = 'button'
    removeBtn.className = 'api-remove-btn'
    removeBtn.textContent = 'x'
    removeBtn.title = 'Remove model'
    removeBtn.addEventListener('click', () => row.remove())

    row.appendChild(input)
    row.appendChild(removeBtn)
    modelsContainer.appendChild(row)
    return row
}

function addPair(data = { url: '', key: '', models: [] }) {
    const pair = document.createElement('div')
    pair.className = 'api-pair'

    const header = document.createElement('div')
    header.className = 'api-pair-header'

    const title = document.createElement('span')
    title.className = 'api-pair-title'
    title.textContent = 'Endpoint'

    const removePairBtn = document.createElement('button')
    removePairBtn.type = 'button'
    removePairBtn.className = 'api-remove-btn'
    removePairBtn.textContent = 'x'
    removePairBtn.title = 'Remove pair'
    removePairBtn.addEventListener('click', () => pair.remove())

    header.appendChild(title)
    header.appendChild(removePairBtn)

    const urlInput = document.createElement('input')
    urlInput.type = 'text'
    urlInput.className = 'api-url-input'
    urlInput.placeholder = 'API URL'
    urlInput.value = data.url || ''

    const keyInput = document.createElement('input')
    keyInput.type = 'password'
    keyInput.className = 'api-key-input'
    keyInput.placeholder = 'API Key'
    keyInput.value = data.key || ''

    const modelsLabel = document.createElement('div')
    modelsLabel.className = 'api-models-label'
    modelsLabel.textContent = 'Models'

    const modelsContainer = document.createElement('div')
    modelsContainer.className = 'api-models'

    const addModelBtn = document.createElement('button')
    addModelBtn.type = 'button'
    addModelBtn.className = 'api-add-model'
    addModelBtn.textContent = '+ Add model'
    addModelBtn.addEventListener('click', () => addModelRow(modelsContainer))

    pair.appendChild(header)
    pair.appendChild(urlInput)
    pair.appendChild(keyInput)
    pair.appendChild(modelsLabel)
    pair.appendChild(modelsContainer)
    pair.appendChild(addModelBtn)

    apiPairsEl.appendChild(pair)

    const initialModels = (data.models && data.models.length) ? data.models : ['']
    for (const m of initialModels) addModelRow(modelsContainer, m)

    return pair
}

function collectApiConfig() {
    const pairs = []
    apiPairsEl.querySelectorAll('.api-pair').forEach((pair) => {
        const url = pair.querySelector('.api-url-input').value.trim()
        const key = pair.querySelector('.api-key-input').value.trim()
        const models = [...pair.querySelectorAll('.api-model-input')]
            .map((i) => i.value.trim())
            .filter((v) => v.length > 0)
        pairs.push({ url, key, models })
    })
    return pairs
}

apiAddPairBtn.addEventListener('click', () => addPair())

apiSaveBtn.addEventListener('click', async () => {
    const config = collectApiConfig()
    try {
        const result = await window.llm.setApiConfig(config)
        if (!result || !result.ok) throw new Error((result && result.error) || 'unknown error')
        await loadModels()
        showBaseSettings()
    } catch (err) {
        alert(`Failed to save API config: ${err.message}`)
    }
})
