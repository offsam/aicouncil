-- Add category column to agents table for UI dropdown grouping
ALTER TABLE agents ADD COLUMN IF NOT EXISTS category TEXT;

-- Backfill categories for existing agents
UPDATE agents SET category = 'code' WHERE name IN ('Claude', 'DeepSeek', 'OR-Qwen');
UPDATE agents SET category = 'analysis' WHERE name IN ('GPT', 'OR-DeepSeek-R1', 'Mistral');
UPDATE agents SET category = 'text' WHERE name IN ('Gemini', 'Groq', 'OR-Llama');
UPDATE agents SET category = 'photo' WHERE name IN ('OR-Gemma');
UPDATE agents SET category = 'video' WHERE name IN ('OR-Mistral');
UPDATE agents SET category = 'text' WHERE category IS NULL;
