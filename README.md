# 🎓 Study Hub: AI Study Assistant

A dark-academia student workspace built with **HTML5, CSS3, vanilla JavaScript, the Google Gemini API, fetch and localStorage**. Paste notes or enter a topic and get a summary, a 5-question quiz and flashcards.

> Add a screenshot here: `![Study Hub](assets/images/screenshot.png)`

## Features
- **Dashboard**: date, daily checklist, weekly goals, assignment and deadline tracker, progress bar, quote, quiz score history
- **Subjects**: Java, DBMS, Web Technology, DSA; add and delete your own
- **AI Assistant**: topic + notes, subject, explanation style (ELI10 / Exam-focused / Detailed), quiz difficulty, loading spinner, Generate button disabled while working, Regenerate
- **Summary**: headings and bullets, copy, download `.txt`, read aloud (Speech Synthesis)
- **Quiz**: 5 MCQs, instant right/wrong with explanation, score and percentage, restart
- **Flashcards**: click to flip, Known / Not known, learned counter
- **History**: saved in localStorage, search, reopen, delete one, clear all
- **Settings**: save / remove / show / hide API key, default style, dark/light theme (remembered)
- **Error handling**: no key, empty input, too-long notes, network failure, 400/401/403/404/429/5xx, invalid or incomplete AI reply

## Project structure
```
study-hub/
├── index.html
├── style.css
├── script.js
├── README.md
└── assets/images/     (optional photos b1.jpg ... b6.jpg for the banner)
```
The banner shows brown gradients until you add six photos named `b1.jpg` to `b6.jpg` in `assets/images/` (dark academia / library / desk photos from Pinterest or Unsplash, ones you have the right to use).

## Run locally (VS Code + Live Server)
1. Install VS Code and the **Live Server** extension.
2. File > Open Folder > `study-hub`.
3. Right-click `index.html` > **Open with Live Server**.

## Get a free Gemini API key
1. Go to <https://aistudio.google.com> and sign in with a Google account.
2. Click **Get API key** > **Create API key**.
3. Open **Settings** in Study Hub, paste the key, click **Save key**.

## Test the API
1. Settings: save your key.
2. AI Assistant: enter the topic "Normalisation in DBMS", click **Generate study material**.
3. Test the errors: empty input, a wrong key (expect 400/401), and Wi-Fi off (network error). Open DevTools > Network to see the request.

## Upload to GitHub
```
git init
git add .
git commit -m "Study Hub: first version"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/study-hub.git
git push -u origin main
```
Commit regularly (layout, dashboard, API, quiz, history, README). Your key is never in the code, so nothing secret is pushed.

## Deploy
- **Netlify**: <https://app.netlify.com/drop> and drag the `study-hub` folder, or "Import from Git" with no build command and publish directory `.`
- **Vercel**: Add New > Project > import the GitHub repo, framework preset **Other**, no build command, deploy.

Every visitor pastes their own key.

## Security note
Keys in localStorage can be read by anyone with access to the browser or by injected scripts. That is acceptable for a college demo where each user uses their own free key. A public product should send requests through a **backend proxy** (for example a serverless function) that keeps the key in an environment variable.

## How the API call works
`script.js > callGemini()` sends `POST https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent` with headers `Content-Type: application/json` and `x-goog-api-key`, and body `{ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json" } }`. The reply text is at `candidates[0].content.parts[0].text`; it is parsed with `JSON.parse` inside try/catch and validated in `parseStudyJson()`. If the model name is retired, change `MODEL` at the top of `script.js`.

## Viva guide
- **Semantic HTML**: header, nav, main, section, form, labels. Good for accessibility and structure.
- **CSS variables**: colours defined once in `:root`; dark mode overrides them with `[data-theme=dark]`. **Grid** for page columns, **Flexbox** for rows, **media queries** for phones.
- **async/await**: `await` pauses a function until a promise (the fetch) finishes, without freezing the page.
- **Fetch request**: URL, method POST, headers, JSON body, then `response.ok`, `response.json()`.
- **Error handling**: `fetch` only rejects on network failure, so HTTP errors are found with `response.ok` / `status`; `try/catch/finally` shows a message and always re-enables the button.
- **Validation**: AI output is untrusted, so check the summary, exactly 5 questions with 4 options, a valid answer, and flashcards before rendering.
- **localStorage**: key-value text storage, so objects use `JSON.stringify` / `JSON.parse`. Used for history, goals, API key, theme.
- **Event delegation**: one listener on `document` handles buttons that are created dynamically.
- **XSS**: `esc()` escapes AI and user text before `innerHTML`.
- **Why not hardcode the key**: anyone could read it in the source and in Git history.
