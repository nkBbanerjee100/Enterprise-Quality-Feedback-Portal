SET FOREIGN_KEY_CHECKS = 0;

-- ------------------------------------------------------------
-- csat_allowed_users
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `csat_allowed_users`;
CREATE TABLE `csat_allowed_users` (
  `Email` varchar(100) NOT NULL,
  `role` enum('QUALITY','DELIVERY','SALES','CUSTOMER','MANAGER') NOT NULL,
  `allowed_by` varchar(100) DEFAULT NULL,
  `is_used` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `used_at` datetime DEFAULT NULL,
  PRIMARY KEY (`Email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ------------------------------------------------------------
-- csat_users
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `csat_users`;
CREATE TABLE `csat_users` (
  `EmpId` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `EmpFirstName` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `EmpMiddleName` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `EmpLastName` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `Gender` varchar(1) COLLATE utf8mb4_unicode_ci DEFAULT 'M',
  `Email` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `hashed_password` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `role` enum('QUALITY','DELIVERY','SALES','CUSTOMER','MANAGER','MANAGEMENT') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'QUALITY',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `is_registered` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  `last_login_at` datetime DEFAULT NULL,
  PRIMARY KEY (`EmpId`),
  UNIQUE KEY `uq_csat_users_email` (`Email`),
  KEY `idx_csat_users_email` (`Email`),
  KEY `idx_csat_users_role` (`role`),
  KEY `idx_csat_users_is_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- csat_cycles
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `csat_cycles`;
CREATE TABLE `csat_cycles` (
  `id` int NOT NULL AUTO_INCREMENT,
  `cycle_name` varchar(255) NOT NULL,
  `description` text,
  `start_date` datetime NOT NULL,
  `end_date` datetime NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_cycle_period` (`start_date`,`end_date`),
  KEY `idx_cycle_name` (`cycle_name`)
) ENGINE=InnoDB AUTO_INCREMENT=43 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ------------------------------------------------------------
-- dim_projects
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `dim_projects`;
CREATE TABLE `dim_projects` (
  `id` int NOT NULL AUTO_INCREMENT,
  `project_id` varchar(50) NOT NULL,
  `project_name` varchar(255) NOT NULL,
  `description` text,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `synced_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `project_id` (`project_id`),
  KEY `idx_project_id` (`project_id`)
) ENGINE=InnoDB AUTO_INCREMENT=40 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ------------------------------------------------------------
-- cycle_project_enrollments  (FK -> csat_cycles)
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `cycle_project_enrollments`;
CREATE TABLE `cycle_project_enrollments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `cycle_id` int NOT NULL,
  `project_id` int NOT NULL,
  `eligibility_status` varchar(30) NOT NULL DEFAULT 'ELIGIBLE',
  `exemption_reason` text,
  `notes` text,
  `enrolled_by` varchar(50) DEFAULT NULL,
  `enrolled_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  `approval_requested_at` datetime DEFAULT NULL,
  `approval_requested_by` varchar(50) DEFAULT NULL,
  `approved_or_declined_by` varchar(50) DEFAULT NULL,
  `approved_or_declined_at` datetime DEFAULT NULL,
  `manager_remarks` text,
  `addition_approval_status` varchar(40) NOT NULL,
  `addition_approved_by` varchar(50) DEFAULT NULL,
  `addition_approved_at` datetime DEFAULT NULL,
  `addition_decision_remarks` text,
  `manager_emp_id` varchar(50) DEFAULT NULL,
  `manager_decided_by` varchar(50) DEFAULT NULL,
  `manager_decided_at` datetime DEFAULT NULL,
  `quality_recheck_by` varchar(50) DEFAULT NULL,
  `quality_recheck_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_cycle_id` (`cycle_id`),
  KEY `idx_project_id` (`project_id`),
  CONSTRAINT `fk_cycle` FOREIGN KEY (`cycle_id`) REFERENCES `csat_cycles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=197 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ------------------------------------------------------------
-- fact_feedback_request
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `fact_feedback_request`;
CREATE TABLE `fact_feedback_request` (
  `id` int NOT NULL AUTO_INCREMENT,
  `csat_cycle_id` int DEFAULT NULL,
  `project_id` int NOT NULL,
  `recipient_email` varchar(255) NOT NULL,
  `recipient_name` varchar(255) NOT NULL,
  `cc_emails` text,
  `token` varchar(256) DEFAULT NULL,
  `feedback_url` varchar(500) DEFAULT NULL,
  `expires_at` datetime DEFAULT NULL,
  `request_sent_at` datetime DEFAULT NULL,
  `reminder_sent_at` datetime DEFAULT NULL,
  `status` varchar(50) NOT NULL DEFAULT 'pending',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `period_of_performance` varchar(255) DEFAULT NULL,
  `pm_achievements` text,
  `pm_approval_status` varchar(50) NOT NULL DEFAULT 'draft',
  `pm_rejection_comments` text,
  `message` text,
  PRIMARY KEY (`id`),
  UNIQUE KEY `token` (`token`),
  KEY `idx_recipient_email` (`recipient_email`),
  KEY `idx_token` (`token`),
  KEY `project_id` (`project_id`),
  KEY `csat_cycle_id` (`csat_cycle_id`)
) ENGINE=InnoDB AUTO_INCREMENT=34 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ------------------------------------------------------------
-- fact_feedback_response  (FK -> fact_feedback_request)
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `fact_feedback_response`;
CREATE TABLE `fact_feedback_response` (
  `id` int NOT NULL AUTO_INCREMENT,
  `feedback_request_id` int NOT NULL,
  `question_id` int DEFAULT NULL,
  `answer_value` text,
  `submitted_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `csat_score` float DEFAULT NULL,
  `nps_score` float DEFAULT NULL,
  `comments` text,
  `response_data` json DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_request_id` (`feedback_request_id`),
  CONSTRAINT `fact_feedback_response_ibfk_1` FOREIGN KEY (`feedback_request_id`) REFERENCES `fact_feedback_request` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ------------------------------------------------------------
-- notifications
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `notifications`;
CREATE TABLE `notifications` (
  `id` int NOT NULL AUTO_INCREMENT,
  `recipient_emp_id` varchar(50) DEFAULT NULL,
  `recipient_role` varchar(30) DEFAULT NULL,
  `type` varchar(50) NOT NULL,
  `title` varchar(255) NOT NULL,
  `message` text NOT NULL,
  `cycle_id` int DEFAULT NULL,
  `project_id` int DEFAULT NULL,
  `enrollment_id` int DEFAULT NULL,
  `link` varchar(500) DEFAULT NULL,
  `is_read` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `actor_emp_id` varchar(50) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `ix_notifications_recipient_emp_id` (`recipient_emp_id`),
  KEY `ix_notifications_recipient_role` (`recipient_role`),
  KEY `ix_notifications_actor_emp_id` (`actor_emp_id`)
) ENGINE=InnoDB AUTO_INCREMENT=329 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ------------------------------------------------------------
-- project_staging
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `project_staging`;
CREATE TABLE `project_staging` (
  `id` int NOT NULL AUTO_INCREMENT,
  `project_id` int NOT NULL,
  `project_ext_id` varchar(50) NOT NULL,
  `status` varchar(40) NOT NULL,
  `selected_by` varchar(50) NOT NULL,
  `selected_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `decided_by` varchar(50) DEFAULT NULL,
  `decided_at` datetime DEFAULT NULL,
  `decision_remarks` text,
  `converted_cycle_id` int DEFAULT NULL,
  `converted_at` datetime DEFAULT NULL,
  `manager_emp_id` varchar(50) DEFAULT NULL,
  `manager_decided_by` varchar(50) DEFAULT NULL,
  `manager_decided_at` datetime DEFAULT NULL,
  `quality_recheck_by` varchar(50) DEFAULT NULL,
  `quality_recheck_at` datetime DEFAULT NULL,
  `exemption_reason` text,
  PRIMARY KEY (`id`),
  KEY `ix_project_staging_project_id` (`project_id`),
  KEY `ix_project_staging_project_ext_id` (`project_ext_id`),
  KEY `ix_project_staging_converted_cycle_id` (`converted_cycle_id`),
  KEY `ix_project_staging_status_converted` (`status`,`converted_cycle_id`)
) ENGINE=InnoDB AUTO_INCREMENT=93 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ------------------------------------------------------------
-- password_reset_otps
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `password_reset_otps`;
CREATE TABLE `password_reset_otps` (
  `id` int NOT NULL AUTO_INCREMENT,
  `email` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `otp_hash` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `expires_at` datetime NOT NULL,
  `attempts` int NOT NULL DEFAULT '0',
  `is_used` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_password_reset_otps_email` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- audit_logs  (FK -> csat_users)
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `audit_logs`;
CREATE TABLE `audit_logs` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `actor_emp_id` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `actor_name` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `actor_role` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `action` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `entity_type` varchar(60) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `entity_id` varchar(60) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `details` text COLLATE utf8mb4_unicode_ci,
  `ip_address` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_agent` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `success` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_audit_logs_actor` (`actor_emp_id`),
  KEY `ix_audit_logs_action` (`action`),
  KEY `ix_audit_logs_entity` (`entity_type`,`entity_id`),
  KEY `ix_audit_logs_created` (`created_at`),
  KEY `ix_audit_logs_action_created` (`action`,`created_at`),
  CONSTRAINT `fk_audit_logs_actor` FOREIGN KEY (`actor_emp_id`) REFERENCES `csat_users` (`EmpId`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=509 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;