const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const scripts = {};
const keys = {};
const freeKeysGiven = new Set();
const plans = {
    '1-month': 30 * 24 * 60 * 60 * 1000,
    '5-months': 5 * 30 * 24 * 60 * 60 * 1000,
    '1-year': 365 * 24 * 60 * 60 * 1000,
    '2-years': 2 * 365 * 24 * 60 * 60 * 1000
};

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const kickScript = `
local message = "This link is already linked to another users account"
local player = game:GetService("Players").LocalPlayer
if player then
    player:Kick(message)
end
`;

const notWhitelistedScript = `
print("Not whitelisted")
`;

const blacklistedScript = `
print("Blacklisted you are not allowed to use this script")
`;

function wrapCodeWithConsoleOutput(code) {
    return `
-- Loading bar for console
for i = 1, 10 do
    print("Loading" .. string.rep(".", i))
    wait(0.1)
end
print("Loaded successfully")

-- The user's original script
do
${code}
end
`;
}

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/api/scripts', (req, res) => {
    res.json(Object.values(scripts));
});

app.post('/api/scripts', (req, res) => {
    const { code } = req.body;
    if (!code) {
        return res.status(400).json({ error: 'Code is required' });
    }
    const id = uuidv4();
    const key = uuidv4();
    scripts[id] = {
        id,
        key,
        code,
        isPaid: true,
        whitelist: [],
        blacklist: [],
        executions: 0,
        firstExecutorId: null,
        freeForAll: true
    };
    console.log('New script created:', scripts[id]);
    res.status(201).json({ id, key, isPaid: true });
});

app.delete('/api/scripts/:id', (req, res) => {
    const { id } = req.params;
    if (scripts[id]) {
        delete scripts[id];
        return res.status(204).send();
    }
    res.status(404).json({ error: 'Script not found' });
});

app.get('/api/users/:scriptId', (req, res) => {
    const { scriptId } = req.params;
    const script = scripts[scriptId];
    if (!script) {
        return res.status(404).json({ error: 'Script not found' });
    }
    res.json({
        whitelist: script.whitelist,
        blacklist: script.blacklist
    });
});

app.post('/api/users/:scriptId/:listType', (req, res) => {
    const { scriptId, listType } = req.params;
    const { userId } = req.body;
    const script = scripts[scriptId];

    if (!script) {
        return res.status(404).json({ error: 'Script not found' });
    }

    // Only allow user management for paid scripts
    if (!script.isPaid) {
        return res.status(403).json({ error: 'User management is only available for paid scripts.' });
    }

    if (listType !== 'whitelist' && listType !== 'blacklist') {
        return res.status(400).json({ error: 'Invalid list type' });
    }

    if (!script[listType].includes(userId)) {
        script[listType].push(userId);
    }

    res.status(200).json(script[listType]);
});

app.delete('/api/users/:scriptId/:listType', (req, res) => {
    const { scriptId, listType } = req.params;
    const { userId } = req.body;
    const script = scripts[scriptId];

    if (!script) {
        return res.status(404).json({ error: 'Script not found' });
    }

    // Only allow user management for paid scripts
    if (!script.isPaid) {
        return res.status(403).json({ error: 'User management is only available for paid scripts.' });
    }

    if (listType !== 'whitelist' && listType !== 'blacklist') {
        return res.status(400).json({ error: 'Invalid list type' });
    }

    const index = script[listType].indexOf(userId);
    if (index > -1) {
        script[listType].splice(index, 1);
    }

    res.status(200).json(script[listType]);
});

app.post('/api/scripts/:id/free-for-all', (req, res) => {
    const { id } = req.params;
    const { state } = req.body;
    const script = scripts[id];
    if (!script) {
        return res.status(404).json({ error: 'Script not found' });
    }
    script.freeForAll = state;
    res.status(200).json({ success: true, freeForAll: state });
});

app.post('/api/generate-key', (req, res) => {
    const { plan } = req.body;
    if (!plans[plan]) {
        return res.status(400).json({ error: 'Invalid plan' });
    }
    const key = uuidv4();
    const expiresAt = Date.now() + plans[plan];
    keys[key] = { expiresAt, plan };
    console.log(`New ${plan} key generated: ${key}`);
    res.status(200).json({ key, expiresAt, plan });
});

app.post('/api/free-key', (req, res) => {
    const { userId } = req.body;
    if (freeKeysGiven.has(userId)) {
        return res.status(403).json({ error: 'You have already received your one-time free key.' });
    }
    const key = uuidv4();
    const expiresAt = Date.now() + plans['1-month'];
    keys[key] = { expiresAt, plan: '1-month', isFree: true };
    freeKeysGiven.add(userId);
    console.log(`New FREE 1-month key generated for user ${userId}: ${key}`);
    res.status(200).json({ key, expiresAt, plan: '1-month' });
});

app.post('/api/check-key', (req, res) => {
    const { key } = req.body;
    const keyData = keys[key];
    if (!keyData) {
        return res.status(401).json({ error: 'Invalid key.' });
    }
    if (Date.now() > keyData.expiresAt) {
        delete keys[key];
        return res.status(401).json({ error: 'Key has expired.' });
    }
    res.status(200).json({ status: 'valid', plan: keyData.plan });
});

app.post('/api/ask-ai', (req, res) => {
    const { question } = req.body;
    const lowerCaseQuestion = question.toLowerCase();
    let answer = "I'm a helpful AI assistant for LuaGuard. I can answer questions about the website's features, like how to create a script, manage users, or get a free key.";
    if (lowerCaseQuestion.includes('create script')) {
        answer = "To create a new script, go to the 'Panel' tab and click the '+' button. Paste your Lua code into the text area and click 'Submit'. You'll get a unique ID and key for your new script.";
    } else if (lowerCaseQuestion.includes('whitelist') || lowerCaseQuestion.includes('blacklist') || lowerCaseQuestion.includes('manage users')) {
        answer = "After creating a script, you can manage user access from the 'Panel' tab. Click the 'Users' icon next to a script to add or remove user IDs from the whitelist and blacklist.";
    } else if (lowerCaseQuestion.includes('free key') || lowerCaseQuestion.includes('get key')) {
        answer = "To get a free key, go to the 'Login' page and click 'Get a Free Key'. This will generate a one-time free API key for you that expires after 30 days.";
    } else if (lowerCaseQuestion.includes('login')) {
        answer = "To log in, enter your API key on the 'Login' page. If you don't have one, you can get a free key or buy a permanent one.";
    } else if (lowerCaseQuestion.includes('plans') || lowerCaseQuestion.includes('buy key')) {
        answer = "You can view our available subscription plans on the 'Plans' page. Each plan gives you a permanent API key with a different duration.";
    } else if (lowerCaseQuestion.includes('discord')) {
        answer = "You can join our community and get support on Discord! Look for the Discord icon in the top-left corner of the page.";
    } else if (lowerCaseQuestion.includes('help')) {
        answer = "I'm here to help! What do you need assistance with? You can ask me about features like 'creating a script,' 'managing users,' or 'getting a key.'";
    }
    res.json({ answer });
});

app.get('/raw/:id', (req, res) => {
    const { id } = req.params;
    const { key, userId } = req.query;
    const script = scripts[id];

    if (!scripts[id] || scripts[id].key !== key) {
        console.log(`Unauthorized access attempt for script ${id} with key ${key}`);
        return res.status(403).send('Unauthorized');
    }

    // Check if "Free for all" is on first
    if (script.freeForAll) {
        console.log(`Script ${id} executed by user ${userId} (Free for all is ON).`);
        script.executions = (script.executions || 0) + 1;
        return res.type('text/plain').send(wrapCodeWithConsoleOutput(script.code));
    }

    // If not "Free for all", proceed with checks
    if (script.firstExecutorId) {
        if (script.firstExecutorId !== userId) {
            console.log(`Unauthorized execution attempt by user ${userId} for script ${id}`);
            return res.type('text/plain').send(kickScript);
        }
    } else {
        script.firstExecutorId = userId;
        console.log(`Script ${id} is now bound to user ${userId}`);
    }

    // Only perform whitelist/blacklist checks for paid scripts
    if (script.isPaid) {
        if (script.blacklist.includes(userId)) {
            console.log(`Blacklisted user ${userId} attempted to run script ${id}`);
            return res.type('text/plain').send(blacklistedScript);
        }

        if (script.whitelist.length > 0 && !script.whitelist.includes(userId)) {
            console.log(`User ${userId} not on whitelist for script ${id}`);
            return res.type('text/plain').send(notWhitelistedScript);
        }
    }

    script.executions = (script.executions || 0) + 1;
    console.log(`Script ${id} executed by user ${userId}. Total executions: ${script.executions}`);

    res.type('text/plain').send(wrapCodeWithConsoleOutput(script.code));
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});