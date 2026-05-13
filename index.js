require('dotenv').config();
const express = require('express');
const axios = require('axios');
const morgan = require('morgan');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;
const VIRTUAL_MODEL_NAME = process.env.ROUTER_VIRTUAL_MODEL_NAME || 'specialrouter';

// Middleware
app.use(cors());
app.use(morgan('dev'));
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

// Helper to parse specialists from .env
function getSpecialists() {
    const specialists = {};
    const keys = Object.keys(process.env);
    
    keys.forEach(key => {
        if (key.startsWith('SPECIALIST_')) {
            const match = key.match(/^SPECIALIST_(\d+)_(\w+)$/);
            if (match) {
                const id = `SPECIALIST_${match[1]}`;
                const field = match[2].toLowerCase(); // topic, model_endpoint, model_name, model_api_key
                
                if (!specialists[id]) {
                    specialists[id] = { id };
                }
                specialists[id][field] = process.env[key];
            }
        }
    });
    
    return Object.values(specialists).filter(s => s.topic && s.model_endpoint && s.model_name);
}

// Router Endpoint
app.get('/health', (req, res) => res.send('OK'));

// Models Endpoint (OpenAI compatibility)
app.get('/v1/models', (req, res) => {
    res.json({
        object: 'list',
        data: [
            {
                id: VIRTUAL_MODEL_NAME,
                object: 'model',
                created: Math.floor(Date.now() / 1000),
                owned_by: 'special-router'
            }
        ]
    });
});

app.post('/v1/chat/completions', async (req, res) => {
    const { model, messages, stream } = req.body;
    const authHeader = req.headers.authorization;

    // 1. Optional: Log model name (we accept any model name as requested)
    console.log(`Incoming request for model: ${model}`);

    // 2. Validate API Key (if configured)
    if (process.env.ROUTER_API_KEY) {
        const providedKey = authHeader ? authHeader.replace('Bearer ', '') : '';
        if (providedKey !== process.env.ROUTER_API_KEY) {
            return res.status(401).json({
                error: {
                    message: 'Invalid API key provided for the specialist router.',
                    type: 'invalid_request_error',
                    param: null,
                    code: 'invalid_api_key'
                }
            });
        }
    }

    const specialists = getSpecialists();
    const specialistListStr = specialists.map(s => `${s.id}: ${s.topic}`).join('\n');

    // 3. Activate Chooser Model
    let chosenSpecialistId = 'FALLBACK';
    try {
        // Extract the last user message or the whole context for the chooser
        const lastMessage = messages[messages.length - 1];
        const content = typeof lastMessage.content === 'string' 
            ? lastMessage.content 
            : JSON.stringify(lastMessage.content);

        const chooserPayload = {
            model: process.env.CHOOSER_MODEL_NAME,
            messages: [
                {
                    role: 'system',
                    content: `You are a specialist router. Your job is to choose the best specialist for the user's prompt.
Available Specialists:
${specialistListStr}

If none of the specialists are a good fit, output "FALLBACK".
ONLY output the ID (e.g., SPECIALIST_1 or FALLBACK). Do not include any other text.`
                },
                {
                    role: 'user',
                    content: `Which specialist is best for this prompt? Prompt: ${content.substring(0, 2000)}`
                }
            ],
            temperature: 0,
            max_tokens: 10
        };

        const chooserResponse = await axios.post(process.env.CHOOSER_MODEL_ENDPOINT, chooserPayload, {
            headers: {
                'Authorization': `Bearer ${process.env.CHOOSER_MODEL_API_KEY}`,
                'Content-Type': 'application/json'
            },
            timeout: 30000 
        });

        const rawChoice = chooserResponse.data.choices[0].message.content.trim();
        
        // Validate choice
        if (specialists.some(s => s.id === rawChoice)) {
            chosenSpecialistId = rawChoice;
        }
    } catch (error) {
        console.error('Error calling chooser model:', error.message);
    }

    // 4. Get Specialist Config
    let selectedConfig;
    if (chosenSpecialistId === 'FALLBACK') {
        selectedConfig = {
            model_endpoint: process.env.FALLBACK_MODEL_ENDPOINT,
            model_name: process.env.FALLBACK_MODEL_NAME,
            model_api_key: process.env.FALLBACK_MODEL_API_KEY
        };
    } else {
        selectedConfig = specialists.find(s => s.id === chosenSpecialistId);
    }

    // 5. Forward Request to Specialist
    try {
        const forwardPayload = {
            ...req.body,
            model: selectedConfig.model_name
        };

        const response = await axios({
            method: 'post',
            url: selectedConfig.model_endpoint,
            data: forwardPayload,
            headers: {
                'Authorization': `Bearer ${selectedConfig.model_api_key}`,
                'Content-Type': 'application/json'
            },
            responseType: stream ? 'stream' : 'json',
            timeout: 0 
        });

        if (stream) {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            
            response.data.on('data', chunk => {
                res.write(chunk);
            });
            
            response.data.on('end', () => {
                res.end();
            });
            
            response.data.on('error', err => {
                console.error('Stream error:', err);
                res.end();
            });
        } else {
            res.json(response.data);
        }
    } catch (error) {
        console.error('Error forwarding to specialist:', error.response ? error.response.data : error.message);
        res.status(error.response ? error.response.status : 500).json(
            error.response ? error.response.data : { error: { message: 'Internal server error during forwarding' } }
        );
    }
});

const server = app.listen(PORT, () => {
    console.log(`AI Specialist Router running on port ${PORT}`);
});

server.timeout = 0;
server.keepAliveTimeout = 0;
server.headersTimeout = 0;
