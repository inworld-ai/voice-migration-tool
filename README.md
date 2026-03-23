# ElevenLabs to Inworld Voice Migration Tool

Batch-migrate your ElevenLabs voice clones into Inworld voice clones. The tool downloads your ElevenLabs voice samples and re-clones them into your Inworld workspace.

**This tool runs locally on your machine** so that all API calls originate from your own IP address.

## Quick Start

```bash
git clone <repo-url>
cd ivc-migration
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

## API Keys

Enter these in the web UI when prompted:

| Key | Required | Where to find it |
|-----|----------|-------------------|
| **ElevenLabs API Key** | Yes | [ElevenLabs Dashboard](https://elevenlabs.io) > Profile > API Key |
| **Inworld API Key** | Yes | Inworld Studio > Integrations > API Key (Base64-encoded) |
| **Inworld Workspace** | Yes | Inworld Studio > your workspace name |

The Inworld API key is also used to generate AI-powered preview utterances via [Inworld Router](https://docs.inworld.ai/router/introduction).

## How It Works

1. **Connect** - Enter your API keys and load your ElevenLabs voice library
2. **Select** - Browse, search, and select voices to migrate
3. **Migrate** - The tool downloads each voice's audio samples from ElevenLabs and clones them into your Inworld workspace
4. **Preview** - Test each migrated voice with a synthesized utterance

## Requirements

- Node.js 18+
- npm
