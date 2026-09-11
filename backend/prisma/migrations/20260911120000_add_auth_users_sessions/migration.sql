-- Etapa 7A: usuários individuais e sessões opacas persistentes.
CREATE TABLE `usuarios` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `username` VARCHAR(50) NOT NULL,
    `senha_hash` VARCHAR(255) NOT NULL,
    `role` ENUM('ADMIN', 'VISUALIZADOR') NOT NULL DEFAULT 'VISUALIZADOR',
    `ativo` BOOLEAN NOT NULL DEFAULT true,
    `admin_slot` TINYINT NULL,
    `ultimo_login_em` DATETIME(0) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL,

    UNIQUE INDEX `uq_usuarios_username`(`username`),
    UNIQUE INDEX `uq_usuarios_admin_slot`(`admin_slot`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `sessoes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `usuario_id` INTEGER NOT NULL,
    `token_hash` CHAR(64) NOT NULL,
    `expires_at` DATETIME(0) NOT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `uq_sessoes_token_hash`(`token_hash`),
    INDEX `idx_sessoes_usuario`(`usuario_id`),
    INDEX `idx_sessoes_expires_at`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `sessoes` ADD CONSTRAINT `fk_sessoes_usuario`
    FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
