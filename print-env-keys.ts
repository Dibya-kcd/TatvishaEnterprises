import dotenv from 'dotenv';
dotenv.config();

console.log("All env keys:", Object.keys(process.env).filter(k => k.includes("SUPABASE") || k.includes("KEY") || k.includes("SECRET")));
