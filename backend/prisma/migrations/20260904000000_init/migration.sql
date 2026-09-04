-- CreateTable
CREATE TABLE `equipamentos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `serial_number` VARCHAR(100) NOT NULL,
    `part_number` VARCHAR(100) NOT NULL,
    `cliente` VARCHAR(255) NOT NULL,
    `patrimonio` VARCHAR(100) NULL,
    `contrato_onecare` VARCHAR(100) NULL,
    `data_inicio_onecare` DATE NOT NULL,
    `data_fim_onecare` DATE NOT NULL,
    `data_ultima_conferencia` DATE NULL,
    `arquivado` BOOLEAN NOT NULL DEFAULT false,
    `arquivado_em` DATETIME(0) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL,

    UNIQUE INDEX `uq_equipamentos_serial_number`(`serial_number`),
    INDEX `idx_equipamentos_arquivado_data_fim`(`arquivado`, `data_fim_onecare`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notificacoes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `equipamento_id` INTEGER NOT NULL,
    `tipo` VARCHAR(50) NOT NULL,
    `mensagem` TEXT NOT NULL,
    `lida` BOOLEAN NOT NULL DEFAULT false,
    `evento_chave` VARCHAR(255) NOT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `uq_notificacao_evento`(`equipamento_id`, `tipo`, `evento_chave`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `historico_contratos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `equipamento_id` INTEGER NOT NULL,
    `contrato_onecare` VARCHAR(100) NULL,
    `data_inicio_onecare` DATE NOT NULL,
    `data_fim_onecare` DATE NOT NULL,
    `substituido_em` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_historico_contratos_equipamento`(`equipamento_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `notificacoes` ADD CONSTRAINT `fk_notificacoes_equipamento` FOREIGN KEY (`equipamento_id`) REFERENCES `equipamentos`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `historico_contratos` ADD CONSTRAINT `fk_historico_contratos_equipamento` FOREIGN KEY (`equipamento_id`) REFERENCES `equipamentos`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
