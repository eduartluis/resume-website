require('dotenv').config();
const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const SYSTEM_PROMPT = fs.readFileSync(path.join(__dirname, 'prompt.md'), 'utf-8');

// Generate LinkedIn QR code at startup if it doesn't exist
const qrPath = path.join(__dirname, 'public', 'linkedin-qr.png');
if (!fs.existsSync(qrPath)) {
  QRCode.toFile(qrPath, 'https://www.linkedin.com/in/eduartluis/', {
    width: 300,
    color: { dark: '#0f2444', light: '#ffffff' },
  }).catch(err => console.error('QR generation failed:', err));
}

app.post('/api/chat', async (req, res) => {
  const { messages } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Invalid messages format' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash-lite',
      systemInstruction: SYSTEM_PROMPT,
    });

    // Gemini uses "model" instead of "assistant" for role
    const history = messages.slice(0, -1).map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const lastMessage = messages[messages.length - 1].content;

    const chat = model.startChat({ history });
    const result = await chat.sendMessageStream(lastMessage);

    for await (const chunk of result.stream) {
      if (res.writableEnded) break;
      const text = chunk.text();
      if (text) res.write(`data: ${JSON.stringify({ text })}\n\n`);
    }

    if (!res.writableEnded) {
      res.write('data: [DONE]\n\n');
      res.end();
    }
  } catch (err) {
    console.error('API error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    }
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Resume website running at http://localhost:${PORT}`);
});
