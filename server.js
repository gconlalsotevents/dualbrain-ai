require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const multer = require("multer");
const pdfParse = require("pdf-parse");

// 🔥 Firebase Setup Imports
const { initializeApp } = require("firebase/app");
const { getFirestore, collection, addDoc } = require("firebase/firestore");

// Firebase Configuration (Aap apni config details yahan ya .env me daal sakte hain)
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || "your_firebase_api_key",
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || "dualbrain-ai.firebaseapp.com",
  projectId: process.env.FIREBASE_PROJECT_ID || "dualbrain-ai",
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "dualbrain-ai.appspot.com",
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "123456789",
  appId: process.env.FIREBASE_APP_ID || "1:123:web:abc"
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

const app = express();
const upload = multer({ limits: { fileSize: 15 * 1024 * 1024 } });

app.use(cors());
app.use(express.json({ limit: "20mb" }));
app.use(express.static("public"));

function getSystemDateContext() {
  const now = new Date();
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Kolkata' };
  return `Current live date in India is ${now.toLocaleDateString('hi-IN', options)}.`;
}

// 🔥 Cloud par chat save karne ka helper function
async function saveChatToCloud(userPrompt, botReply, sourceEngine) {
  try {
    await addDoc(collection(db, "dualbrain_chats"), {
      prompt: userPrompt,
      reply: botReply,
      source: sourceEngine,
      timestamp: new Date()
    });
    console.log("Chat successfully saved to Firebase Cloud!");
  } catch (e) {
    console.error("Firebase save error:", e.message);
  }
}

// 1. DeepSeek AI Engine
async function callDeepSeek(messages) {
  try {
    const apiKey = (process.env.DEEPSEEK_API_KEY || "").trim();
    if (!apiKey) return null;
    const res = await axios.post(
      "https://api.deepseek.com/chat/completions",
      { model: "deepseek-chat", messages: messages, stream: false },
      { headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, timeout: 8000 }
    );
    return res.data?.choices?.[0]?.message?.content || null;
  } catch (err) {
    return null;
  }
}

// 2. Meta / Groq AI Engine
async function callGroq(messages) {
  try {
    const apiKey = (process.env.GROQ_API_KEY || "").trim();
    if (!apiKey) return null;
    const res = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      { model: "qwen/qwen3.8-27b", messages: messages },
      { headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, timeout: 8000 }
    );
    return res.data?.choices?.[0]?.message?.content || null;
  } catch (err) {
    return null;
  }
}

// 3. Google Gemini Engine
async function callGemini(promptText) {
  try {
    const apiKey = (process.env.GEMINI_API_KEY || "").trim();
    if (!apiKey) return null;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const res = await axios.post(url, {
      contents: [{ role: "user", parts: [{ text: promptText }] }]
    }, { headers: { "Content-Type": "application/json" }, timeout: 8000 });
    return res.data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
  } catch (err) {
    return null;
  }
}

// 4. OpenAI ChatGPT Engine
async function callChatGPT(messages) {
  try {
    const apiKey = (process.env.OPENAI_API_KEY || "").replace(/"/g, "").trim();
    if (!apiKey) return null;
    const res = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      { model: "gpt-4o-mini", messages: messages },
      { headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, timeout: 8000 }
    );
    return res.data?.choices?.[0]?.message?.content || null;
  } catch (err) {
    return null;
  }
}

// 🔄 MULTI-AI SMART FALLBACK ROUTER
async function getSmartAIResponse(prompt, history = []) {
  const systemPrompt = `${getSystemDateContext()}
Aap DualBrain AI hain (All-in-One Smart Assistant). 
TUMHARI MEMORY: User ki pichli baatein yaad rakhna. 
Hamesha helpful aur clear jawab dein.`;

  const messages = [
    { role: "system", content: systemPrompt },
    ...history,
    { role: "user", content: prompt }
  ];

  let reply = await callDeepSeek(messages);
  if (reply) return { reply, source: "DeepSeek AI 🧠" };

  reply = await callGroq(messages);
  if (reply) return { reply, source: "DualBrain AI (Meta/Groq) ⚡" };

  reply = await callGemini(prompt);
  if (reply) return { reply, source: "Google Gemini 🌐" };

  reply = await callChatGPT(messages);
  if (reply) return { reply, source: "ChatGPT (OpenAI) ✨" };

  return { reply: "Sabhi AI engines se response nahi mila. Kripya apni .env key check karein.", source: "System" };
}

// 🌍 Advanced Live Web Search Engine
async function searchWeb(query) {
  try {
    const res = await axios.get(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      timeout: 6000 
    });
    
    const html = res.data;
    let snippets = [];
    let matches = html.match(/class="result__snippet[^>]*>(.*?)<\/a>/g);
    if (matches) {
      snippets = matches.map(m => m.replace(/<[^>]*>?/gm, '').trim());
    }
    
    if (snippets.length > 0) {
      return `Live Web Search Results: ${snippets.slice(0, 4).join(" | ")}`;
    }
    return null;
  } catch (err) {
    console.error("Web search error:", err.message);
    return null;
  }
}

async function shouldSearchWeb(prompt) {
  const p = prompt.toLowerCase();
  const liveKeywords = [
    "news", "aaj", "current", "latest", "match", "score", "result", "ka hua", 
    "kon", "kaun", "kya hai", "kya chal raha", "price", "rate", "weather", 
    "election", "winner", "update", "2026", "aajkal", "abhi", "match hua"
  ];
  const hasTimeReference = p.includes("14") || p.includes("kal") || p.includes("parso") || p.includes("din") || p.includes("2026");
  return liveKeywords.some(keyword => p.includes(keyword)) || hasTimeReference;
}

// Main Chat Route
app.post("/api/chat", async (req, res) => {
  try {
    const { prompt, history = [] } = req.body;
    if (!prompt) return res.status(400).json({ error: "Prompt zaroori hai!" });

    console.log("User sawal:", prompt);
    const pLower = prompt.toLowerCase();

    // Photo Generation Handler
    const isPhoto = pLower.includes("photo") || pLower.includes("pic") || pLower.includes("image") || pLower.includes("tasveer");
    const isAction = pLower.includes("banao") || pLower.includes("create") || pLower.includes("draw") || pLower.includes("dikhao");
    
    if (isPhoto && isAction && !pLower.includes("kya hai")) {
      const subject = prompt.replace(/(banao|draw|create|generate|dikhao|do|ki|ka|ke|mujhe|ek|photo|pic|image|tasveer)/gi, "").trim();
      const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(subject || prompt + " 4k photography")}?width=800&height=500&nologo=true`;
      
      // Save photo generation to cloud
      saveChatToCloud(prompt, `Generated Image: ${subject}`, "DualBrain Studio");

      return res.json({ reply: `✨ Ye lijiye aapki photo: "${subject || prompt}"`, source: "DualBrain Studio", imageUrl: imageUrl });
    }

    // 🌍 Live Web Search Trigger
    let searchContext = "";
    const needsWeb = await shouldSearchWeb(prompt);
    
    if (needsWeb) {
      console.log("Internet search triggered for:", prompt);
      const webResult = await searchWeb(prompt);
      if (webResult) {
        searchContext = `\n\nLive Web Search Context (Real-time info): ${webResult}`;
      }
    }

    const finalPrompt = prompt + searchContext;
    const result = await getSmartAIResponse(finalPrompt, history);
    
    if(searchContext) {
      result.source = result.source + " + Live Web 🌍";
    }

    // 🔥 Save chat conversation to Firebase Cloud Database
    saveChatToCloud(prompt, result.reply, result.source);

    return res.json(result);

  } catch (err) {
    console.error("Route Error:", err);
    return res.status(500).json({ reply: "Server error!", source: "System" });
  }
});

// Short Video Script Generator Route
app.post("/api/generate-video", async (req, res) => {
  try {
    const { topic } = req.body;
    if (!topic) return res.status(400).json({ error: "Topic zaroori hai!" });

    const prompt = `Create a short video script for the topic: "${topic}". Provide 3 distinct scenes with Visual description and Narration.`;
    const result = await getSmartAIResponse(prompt);
    
    const scenes = [
      { text: `Scene 1: ${topic}`, image: `https://image.pollinations.ai/prompt/${encodeURIComponent(topic + " cinematic scene 1")}?width=540&height=960&nologo=true` },
      { text: `Scene 2: Facts about ${topic}`, image: `https://image.pollinations.ai/prompt/${encodeURIComponent(topic + " cinematic scene 2")}?width=540&height=960&nologo=true` },
      { text: `Scene 3: Conclusion`, image: `https://image.pollinations.ai/prompt/${encodeURIComponent(topic + " cinematic scene 3")}?width=540&height=960&nologo=true` }
    ];

    return res.json({
      reply: result.reply,
      source: "DualBrain Video Studio 🎬",
      scenes: scenes
    });
  } catch (err) {
    return res.status(500).json({ reply: "Video generation error!" });
  }
});

// File Upload Route (PDF/Docs)
app.post("/api/upload-file", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "File nahi mili!" });
    
    let extractedText = "";
    if (req.file.mimetype === "application/pdf") {
      const data = await pdfParse(req.file.buffer);
      extractedText = data.text;
    } else {
      extractedText = req.file.buffer.toString("utf-8");
    }

    const trimmedText = extractedText.substring(0, 15000);
    const result = await getSmartAIResponse(req.body.prompt || "Is document ke notes banao.", [
      { role: "system", content: `Context document: """${trimmedText}"""` }
    ]);
    
    // Save file query to cloud
    saveChatToCloud(`[File Upload]: ${req.file.originalname}`, result.reply, result.source);

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ reply: "File read error!" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server live ho gaya: http://localhost:${PORT}`);
});