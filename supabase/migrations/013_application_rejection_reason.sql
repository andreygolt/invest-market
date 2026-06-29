-- Аддитивная миграция: добавляем nullable-поле rejection_reason в applications
ALTER TABLE applications ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
