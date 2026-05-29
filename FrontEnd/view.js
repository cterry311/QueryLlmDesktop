const messagesEl = document.getElementById('messages')
const composerEl = document.getElementById('composer')
const inputEl = document.getElementById('input')
const sendBtn = document.getElementById('send-btn')
const attachBtn = document.getElementById('attach-btn')
const fileInput = document.getElementById('file-input')
const attachmentsEl = document.getElementById('attachments')
const modelSelect = document.getElementById('model-select')
const sidebarListEl = document.getElementById('conversation-list')
const newChatBtn = document.getElementById('new-chat-btn')
const dirAttachBtn = document.getElementById('dir-attach-btn')
const dirLabelEl = document.getElementById('dir-label')
const dirClearBtn = document.getElementById('dir-clear-btn')
const permissionModal = document.getElementById('permission-modal')
const permissionToolEl = document.getElementById('permission-tool')
const permissionDetailsEl = document.getElementById('permission-details')
const permissionAllowBtn = document.getElementById('permission-allow')
const permissionDenyBtn = document.getElementById('permission-deny')

let currentConversationId = null
let conversations = []
let pendingDirectory = null          // chosen before first message of a new chat
let activeConversationDirectory = null // directory of the currently-open conversation (read-only)
let activePermissionId = null
let attachments = []

function updateDirectoryBar() {
    const isNewChat = currentConversationId === null
    const displayDir = isNewChat ? pendingDirectory : activeConversationDirectory

    if (displayDir) {
        dirLabelEl.textContent = `Directory: ${displayDir}`
        dirLabelEl.title = displayDir
        dirLabelEl.classList.remove('hidden')
    } else {
        dirLabelEl.classList.add('hidden')
        dirLabelEl.textContent = ''
        dirLabelEl.title = ''
    }

    if (isNewChat) {
        dirAttachBtn.classList.remove('hidden')
        dirAttachBtn.textContent = pendingDirectory ? 'Change directory' : 'Attach directory'
        if (pendingDirectory) {
            dirClearBtn.classList.remove('hidden')
        } else {
            dirClearBtn.classList.add('hidden')
        }
    } else {
        dirAttachBtn.classList.add('hidden')
        dirClearBtn.classList.add('hidden')
    }
}

dirAttachBtn.addEventListener('click', async () => {
    try {
        const result = await window.llm.pickDirectory()
        if (result.ok && result.directory) {
            pendingDirectory = result.directory
            updateDirectoryBar()
        }
    } catch (err) {
        console.error('Failed to pick directory:', err)
    }
})

dirClearBtn.addEventListener('click', () => {
    pendingDirectory = null
    updateDirectoryBar()
})

function renderConversationList() {
    sidebarListEl.innerHTML = ''
    for (const c of conversations) {
        const li = document.createElement('li')
        li.className = 'conversation-item' + (c.id === currentConversationId ? ' active' : '')
        li.textContent = c.title
        li.title = c.title
        li.dataset.id = String(c.id)
        li.addEventListener('click', () => openConversation(c.id))
        sidebarListEl.appendChild(li)
    }
}

async function loadConversations() {
    try {
        const result = await window.llm.listConversations()
        if (!result.ok) throw new Error(result.error)
        conversations = result.conversations || []
        renderConversationList()
    } catch (err) {
        console.error('Failed to load conversations:', err)
    }
}

function clearMessages() {
    messagesEl.innerHTML = ''
}

async function openConversation(id) {
    try {
        const result = await window.llm.getConversationMessages(id)
        if (!result.ok) throw new Error(result.error)
        currentConversationId = id
        activeConversationDirectory = result.directory || null
        pendingDirectory = null
        clearMessages()
        console.log(JSON.stringify(result.messages, null, 2))
        for (const m of (result.messages || [])) {
            const who = m.role === 'user' ? 'user' : 'assistant'
            const bubble = addBubble('', who)
            bubble.innerHTML = ''
            let textContent = ''
            if (Array.isArray(m.content)) {
                for (const chunk of m.content) {
                    if (chunk.type === 'text') {
                        textContent += chunk.text
                    } else if (chunk.type === 'image_url') {
                        const img = document.createElement('img')
                        img.src = chunk.image_url.url
                        bubble.appendChild(img)
                    }
                }
            } else {
                textContent = m.content || ''
            }
            if (who === 'assistant') {
                const pElement = document.createElement('p')
                pElement.innerHTML = marked.parse(textContent || '')
                bubble.appendChild(pElement)
            } else {
                const pElement = document.createElement('p')
                pElement.innerText = textContent || ''
                bubble.appendChild(pElement)
            }
        }
        renderConversationList()
        updateDirectoryBar()
    } catch (err) {
        console.error('Failed to open conversation:', err)
    }
}

function startNewConversation() {
    currentConversationId = null
    activeConversationDirectory = null
    pendingDirectory = null
    clearMessages()
    renderConversationList()
    updateDirectoryBar()
    inputEl.focus()
}

newChatBtn.addEventListener('click', startNewConversation)
loadConversations()
updateDirectoryBar()

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
            opt.value = m.id + "%" + m.routeId
            opt.textContent = `${m.isFree ? 'FREE ' : ''}${m.name || m.id}`
            opt.className = m.routeId !== 0 ? 'model-added' : (m.isFree ? 'model-free' : 'model-paid')
            modelSelect.appendChild(opt)
        }
        const defaultOpt = [...modelSelect.options].find((o) => o.value === 'openrouter/free')
        modelSelect.value = defaultOpt ? 'openrouter/free%0' : modelSelect.options[0]?.value || ''
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
    let content = inputEl.value.trim()
    if (attachments.length > 0) {
        content = [];
        for (const a of attachments) {
            content.push({
                type: 'image_url',
                image_url: { url: `data:${a.mimeType};base64,${a.base64}` }
            });
        }
        const textValue = inputEl.value.trim();
        if (textValue) {
            content.push({ type: 'text', text: textValue });
        }
    }
    if (!content) return



    const bubble = addBubble(inputEl.value.trim(), 'user')
    if (attachments.length > 0) {
        bubble.innerHTML = ''
        for (const a of attachments) {
            const img = document.createElement('img')
            img.src = `data:${a.mimeType};base64,${a.base64}`
            bubble.appendChild(img)
        }
        const textValue = inputEl.value.trim();
        if (textValue) {
            const pElement = document.createElement('p')
            pElement.innerText = textValue
            bubble.appendChild(pElement)
        }
    }
    attachments = []
    attachmentsEl.innerHTML = ''
    inputEl.value = ''
    sendBtn.disabled = true

    const pending = addBubble('thinking...', 'assistant', { pending: true })
    let rawReply = '';
    let firstChunk = true;



    const isNewConversation = currentConversationId === null
    const directoryForRequest = isNewConversation ? pendingDirectory : null

    // Clean up any leftover listeners from a previous message
    window.llm.removeStreamListeners();

    window.llm.onChunk((chunk) => {
        if (firstChunk) {
            pending.textContent = ''; // clear placeholder only on first real chunk
            firstChunk = false;
            pending.classList.remove('pending')
        }
        rawReply += chunk;
        pending.innerHTML = marked.parse(rawReply);
    });

    window.llm.onMeta((meta) => {
        if (!meta || meta.conversationId === undefined) return;
        currentConversationId = meta.conversationId;
        if (Object.prototype.hasOwnProperty.call(meta, 'directory')) {
            activeConversationDirectory = meta.directory || null;
            pendingDirectory = null;
            updateDirectoryBar();
        }
        conversations.unshift({ id: meta.conversationId, title: meta.conversationTitle || 'New conversation' });
        renderConversationList();
    });

    window.llm.onPermissionRequest((perm) => {
        showPermissionModal(perm);
    });

    window.llm.onDone(() => {
        sendBtn.disabled = false;
        inputEl.focus();
    });

    window.llm.onError((err) => {
        pending.classList.remove('pending');
        pending.textContent = `Error: ${err}`;
        sendBtn.disabled = false;
        inputEl.focus();
    });

    try {
        const lastPercent = modelSelect.value.lastIndexOf('%');
        const modelId = modelSelect.value.substring(0, lastPercent);
        const routeId = parseInt(modelSelect.value.substring(lastPercent + 1));
        await window.llm.stream(content, modelId || 'openrouter/free', routeId || 0, isNewConversation, directoryForRequest); //TODO: have it switch form string to array if image content is included
    } catch (err) {
        pending.classList.remove('pending')
        pending.textContent = `Error: ${err.message}`
        sendBtn.disabled = false;
        inputEl.focus();
    }
}

function formatPermissionDetails(perm) {
    if (!perm) return ''
    if (perm.tool === 'edit_file') {
        const filePath = perm.args?.path ?? '(unknown path)'
        const content = perm.args?.content ?? ''
        return `File: ${filePath}\n\n--- proposed content ---\n${content}`
    }
    if (perm.tool === 'execute_command') {
        const command = perm.args?.command ?? '(no command)'
        return `Command:\n${command}`
    }
    try {
        return JSON.stringify(perm.args, null, 2)
    } catch {
        return String(perm.args)
    }
}

function showPermissionModal(perm) {
    activePermissionId = perm.id
    const toolLabel = perm.tool === 'edit_file'
        ? 'The agent wants to create or modify a file:'
        : (perm.tool === 'execute_command'
            ? 'The agent wants to run a terminal command:'
            : `The agent wants to use the "${perm.tool}" tool:`)
    permissionToolEl.textContent = toolLabel
    permissionDetailsEl.textContent = formatPermissionDetails(perm)
    permissionModal.classList.remove('hidden')
}

function hidePermissionModal() {
    permissionModal.classList.add('hidden')
    permissionToolEl.textContent = ''
    permissionDetailsEl.textContent = ''
    activePermissionId = null
}

async function respondPermission(decision) {
    if (!activePermissionId) {
        hidePermissionModal()
        return
    }
    const id = activePermissionId
    hidePermissionModal()
    try {
        await window.llm.respondPermission(id, decision)
    } catch (err) {
        console.error('Failed to send permission decision:', err)
    }
}

permissionAllowBtn.addEventListener('click', () => respondPermission('allow'))
permissionDenyBtn.addEventListener('click', () => respondPermission('deny'))

attachBtn.addEventListener('click', () => {
    fileInput.click();
});

fileInput.addEventListener('change', async () => {
    const files = Array.from(fileInput.files);
    for (const file of files) {
        const { base64, mimeType } = await resizeImage(file);
        const id = crypto.randomUUID();
        attachments.push({ id, base64, mimeType });
        renderAttachment(id, base64);
    }
    fileInput.value = "";
});

function resizeImage(file, maxWidth = 800, maxHeight = 800, quality = 0.8) {
    return new Promise((resolve) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            // calculate new dimensions preserving aspect ratio
            let width = img.width;
            let height = img.height;
            if (width > maxWidth || height > maxHeight) {
                const ratio = Math.min(maxWidth / width, maxHeight / height);
                width = Math.round(width * ratio);
                height = Math.round(height * ratio);
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            canvas.getContext('2d').drawImage(img, 0, 0, width, height);

            URL.revokeObjectURL(url); // cleanup
            resolve({
                base64: canvas.toDataURL('image/jpeg', quality).split(',')[1],
                mimeType: 'image/jpeg'
            });
        };
        img.src = url;
    });
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            // reader.result is the full data URI, strip the prefix to get raw base64
            const base64 = reader.result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function renderAttachment(id, base64) {
    const wrapper = document.createElement('div');
    wrapper.className = 'attachment-preview';
    wrapper.dataset.id = id;

    const img = document.createElement('img');
    // for display we need the full data URI
    img.src = `data:image/*;base64,${base64}`;

    const removeBtn = document.createElement('button');
    removeBtn.className = 'attachment-remove';
    removeBtn.type = 'button'; // prevent form submit
    removeBtn.textContent = 'x';
    removeBtn.addEventListener('click', () => removeAttachment(id));

    wrapper.appendChild(img);
    wrapper.appendChild(removeBtn);
    attachmentsEl.appendChild(wrapper);
}

function removeAttachment(id) {
    attachments = attachments.filter(a => a.id !== id);
    const el = attachmentsEl.querySelector(`[data-id="${id}"]`);
    if (el) el.remove();
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
        } else if (key === 'clear') {

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
