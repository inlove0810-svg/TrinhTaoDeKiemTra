// Nội dung file: /api/generate.js

/**
 * Hàm serverless này chạy trên Vercel, hoạt động như một backend bảo mật.
 * - Nó nhận yêu cầu (prompt) từ frontend (index.html).
 * - Nó lấy GEMINI_API_KEY từ biến môi trường của Vercel (bảo mật).
 * - Nó gọi API của Google Gemini với prompt đó.
 * - Nó trả về kết quả (văn bản đề thi) cho frontend.
 */
export default async function handler(req, res) {
  // 1. Chỉ chấp nhận phương thức POST
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Phương thức ${req.method} không được phép` });
  }

  // 2. Lấy API Key từ biến môi trường trên Vercel
  const API_KEY = process.env.GEMINI_API_KEY;
  if (!API_KEY) {
    console.error('Chưa đặt biến GEMINI_API_KEY');
    return res.status(500).json({ error: 'Lỗi cấu hình máy chủ: API Key chưa được thiết lập.' });
  }

  // 3. Lấy nội dung payload (prompt) mà frontend gửi lên
  // req.body chính là đối tượng `payload` bạn đã tạo trong index.html
  const payload = req.body;

  // 4. Cấu hình các thiết lập an toàn
  // Rất quan trọng để tránh AI tạo nội dung không phù hợp
  const safetySettings = [
    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
  ];
  
  // Gắn safetySettings vào payload
  const bodyWithSafety = {
    ...payload,
    safetySettings: safetySettings,
  };

  const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent?key=${API_KEY}`;

  try {
    // 5. Gọi đến Google AI
    const geminiResponse = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyWithSafety), // Gửi payload đã bao gồm safetySettings
    });

    const data = await geminiResponse.json();

    // 6. Xử lý lỗi từ Google (nếu có)
    if (!geminiResponse.ok) {
      console.error('Lỗi từ Google AI:', data);
      const errorMsg = data.error?.message || 'Không thể lấy phản hồi từ Google AI.';
      return res.status(geminiResponse.status).json({ error: errorMsg });
    }

    // 7. Xử lý trường hợp bị chặn vì lý do an toàn (prompt không phù hợp)
    if (!data.candidates || data.candidates.length === 0) {
        if (data.promptFeedback && data.promptFeedback.blockReason) {
            console.warn('Prompt bị chặn:', data.promptFeedback.blockReason);
            return res.status(400).json({ error: `Yêu cầu bị chặn: ${data.promptFeedback.blockReason}. Vui lòng sửa lại chủ đề.` });
        }
        return res.status(500).json({ error: 'Không nhận được kết quả từ AI.' });
    }

    // 8. Trích xuất văn bản và gửi về cho frontend
    // Đây là cấu trúc chuẩn của Gemini
    const text = data.candidates[0].content.parts[0].text;
    
    // Gửi về đúng định dạng { text: "..." } mà index.html mong đợi
    res.status(200).json({ text: text });

  } catch (err) {
    console.error('Lỗi nghiêm trọng tại backend:', err);
    res.status(500).json({ error: `Lỗi máy chủ nội bộ: ${err.message}` });
  }
}