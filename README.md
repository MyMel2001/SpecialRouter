# SpecialRouter

A high-performance Node.js/Express-based intelligent router for LLM requests. This system acts as an OpenAI-compatible gateway that dynamically routes incoming prompts to the most suitable "specialist" model based on the content of the request.

## How it Works

1.  **Incoming Request**: The router receives an OpenAI-compatible chat completion request (including multimodal/image data).
2.  **Specialist Selection**: A dedicated "Chooser" model analyzes the prompt and compares it against a list of defined specialist topics.
3.  **Dynamic Routing**: The request is forwarded to the selected specialist model, or a fallback model if no match is found.
4.  **Streaming Support**: Full support for Server-Sent Events (SSE) streaming and large payloads.

## Features

- **OpenAI Compatible**: Seamlessly integrates with any frontend or tool that supports OpenAI endpoints.
- **Multimodal Support**: Forwards images and other content blocks without modification.
- **Zero Timeouts**: Configured for long-running reasoning tasks and deep streams.
- **Dynamic Specialists**: Easily add or remove specialists via environment variables.

## Configuration

Copy the `.env.example` to `.env` and configure your models:

```bash
cp .env.example .env
```

### Key Configuration Variables:

- `ROUTER_VIRTUAL_MODEL_NAME`: The model name users should specify in their client (e.g., `specialist-router`).
- `CHOOSER_MODEL_...`: Configuration for the model that performs the routing logic.
- `SPECIALIST_{N}_...`: Define your specialists. Each needs a `TOPIC`, `MODEL_ENDPOINT`, `MODEL_NAME`, and `MODEL_API_KEY`.
- `FALLBACK_MODEL_...`: The "other" model used if the router cannot determine a specific specialist.

## Installation

```bash
npm install
npm start
```

## Usage

Point your AI client to:
`http://localhost:3000/v1`

**Model Name**: Use the `ROUTER_VIRTUAL_MODEL_NAME` you defined.
**API Key**: Use the `ROUTER_API_KEY` you defined (or leave empty if not set).

## Performance Note

The router performs a "pre-flight" call to the Chooser model. For optimal performance, use a fast/lightweight model for the Chooser (e.g., GPT-4o-mini or a local small model).
