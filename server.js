require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const { OpenAI } = require("openai");
const fs = require("fs");
const path = require("path");
const stringSimilarity = require("string-similarity");

const productData = JSON.parse(
  fs.readFileSync(path.join(__dirname, "productData.json"), "utf-8")
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const app = express();
const port = 3000;
const sessionStore = {};
app.use(bodyParser.urlencoded({ extended: false }));

// Twilio client
const twilio = require("twilio");
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

app.get("/whatsapp", (req, res) => res.send("Agent Running"));

app.post("/whatsapp", async (req, res) => {
  const incomingMsg = req.body.Body.toLowerCase();
  const from = req.body.From;

  if (!sessionStore[from]) {
    sessionStore[from] = {
      messages: [
        {
          role: "system",
          content: `
          You are a WhatsApp assistant for a product store.
          Be helpful, polite, and always give concise answers.
          `
        }
      ],
      lastProductMatched: null
    };
  }

  // Match product from JSON
  const keywords = Object.keys(productData);
  const bestMatch = stringSimilarity.findBestMatch(incomingMsg, keywords).bestMatch;

  if (bestMatch.rating > 0.5) {
    const product = productData[bestMatch.target];
    sessionStore[from].lastProductMatched = bestMatch.target;

    const response = `${product.title}*\n Price: ${product.fee}\n Warranty: ${product.duration}\n✨ Features: ${product.content}\n\nWhy choose us: ${product.extras}`;

    const twiml = product.mediaUrl
      ? `<Response><Message><Body>${response}</Body><Media>${product.mediaUrl}</Media></Message></Response>`
      : `<Response><Message>${response}</Message></Response>`;

    res.set("Content-Type", "text/xml");
    return res.send(twiml);
  }

  // Fallback >>> GPT
  sessionStore[from].messages.push({ role: "user", content: incomingMsg });
  const gptResponse = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages: sessionStore[from].messages
  });
  const reply = gptResponse.choices[0].message.content;

  sessionStore[from].messages.push({ role: "assistant", content: reply });
  const twiml = `<Response><Message>${reply}</Message></Response>`;
  res.set("Content-Type", "text/xml");
  res.send(twiml);
});

app.listen(port, () => {
  console.log(`WhatsApp agent running at http://localhost:${port}`);
});
