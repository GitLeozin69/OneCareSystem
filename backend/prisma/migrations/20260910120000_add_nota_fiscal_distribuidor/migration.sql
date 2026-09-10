-- Adiciona os campos sem impor um valor padrão aos novos cadastros.
ALTER TABLE `equipamentos`
    ADD COLUMN `nota_fiscal` VARCHAR(100) NULL,
    ADD COLUMN `distribuidor` VARCHAR(255) NULL;

-- Compatibiliza somente os registros anteriores à obrigatoriedade.
UPDATE `equipamentos`
SET `distribuidor` = 'NÃO INFORMADO'
WHERE `distribuidor` IS NULL;

ALTER TABLE `equipamentos`
    MODIFY COLUMN `distribuidor` VARCHAR(255) NOT NULL;
