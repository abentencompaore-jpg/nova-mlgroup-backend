export default function handler(req, res) {
  res.status(200).json({ 
    status: "OK", 
    message: "Le backend NOVA est en ligne 🚀",
    timestamp: new Date().toISOString()
  });
}