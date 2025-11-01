// /api/generate.js

// Bọc TOÀN BỘ hàm trong try...catch để bắt mọi lỗi
export default async function handler(request, response) {
    try {
        // --- GUARD CLAUSES (Kiểm tra đầu vào) ---

        // 1. Kiểm tra phương thức (Method)
        // (vercel.json đã xử lý OPTIONS, nhưng chúng ta vẫn chỉ cho phép POST)
        if (request.method !== 'POST') {
            return response.status(405).json({ message: 'Method Not Allowed. Chỉ chấp nhận POST.' });
        }

        // 2. Kiểm tra API Key
        const API_KEY = process.env.GEMINI_API_KEY;
        if (!API_KEY) {
            console.error('LỖI: Chưa thiết lập GEMINI_API_KEY trên Vercel.');
            return response.status(500).json({ error: 'API key chưa được cấu hình trên máy chủ.' });
        }

        // 3. Parse body request
        let requestBody;
        if (typeof request.body === 'string') {
            try {
                requestBody = JSON.parse(request.body);
            } catch (e) {
                return response.status(400).json({ error: 'Request body không phải là JSON hợp lệ.' });
            }
        } else {
            requestBody = request.body; // Giả sử Vercel đã parse
        }

        // 4. Trích xuất prompt từ body
        const prompt = requestBody?.contents?.[0]?.parts?.[0]?.text;
        const systemPrompt = requestBody?.systemInstruction;

        if (!prompt) {
            return response.status(400).json({ error: 'Không nhận được prompt. Dữ liệu rỗng.' });
        }

        // --- LOGIC CHÍNH (Gọi Google) ---

        const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${API_KEY}`;

        // Xây dựng payload an toàn ở backend
        const payload = {
            contents: [{
                parts: [{ text: prompt }]
            }],
            ...(systemPrompt && { systemInstruction: systemPrompt }),
            safetySettings: [
                { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" }
            ],
            generationConfig: {
                temperature: 0.8,
                topK: 40,
                topP: 0.9,
                maxOutputTokens: 2048,
            }
        };

        // Gọi API Google
        const geminiResponse = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload)
        });

        // Xử lý nếu Google báo lỗi
        if (!geminiResponse.ok) {
            const errorBody = await geminiResponse.text();
            console.error('Lỗi từ Google API:', errorBody);
            // Trả về lỗi của Google cho trình duyệt
            return response.status(geminiResponse.status).json({ error: `Google API báo lỗi: ${errorBody}` });
        }

        // Lấy dữ liệu
        const data = await geminiResponse.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!text) {
            console.error('Không trích xuất được text từ Google response:', data);
            return response.status(500).json({ error: 'Không nhận được nội dung từ AI (có thể do bộ lọc an toàn).' });
        }

        // THÀNH CÔNG: Gửi đề thi về
        return response.status(200).json({ text });

    } catch (error) {
        // --- CATCH-ALL (Bắt lỗi cuối cùng) ---
        // Bất kỳ lỗi nào không lường trước được sẽ bị bắt ở đây
        console.error('Lỗi nghiêm trọng không lường trước trong hàm API:', error);
        return response.status(500).json({ error: `Lỗi máy chủ nội bộ: ${error.message}` });
    }
}