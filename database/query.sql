CREATE TABLE IF NOT EXISTS csat_users (
 
    -- --------------------------------------------------------
    -- Mirrored from tmstestdb1.tsms_user (populated on registration)
    -- --------------------------------------------------------
    EmpId               VARCHAR(100)    NOT NULL,
    EmpFirstName        VARCHAR(100)    DEFAULT NULL,
    EmpMiddleName       VARCHAR(100)    DEFAULT NULL,
    EmpLastName         VARCHAR(100)    DEFAULT NULL,
    Gender              VARCHAR(1)      DEFAULT 'M',
    Email               VARCHAR(100)    DEFAULT NULL,
 
    -- --------------------------------------------------------
    -- CSAT-specific columns (not in tmstestdb1)
    -- --------------------------------------------------------
    hashed_password     VARCHAR(255)    NOT NULL,               -- set by user on first registration
    role                ENUM(
                            'QUALITY',
                            'DELIVERY',
                            'SALES',
                            'CUSTOMER'
                        )               NOT NULL DEFAULT 'Management_User',
    is_active           TINYINT(1)      NOT NULL DEFAULT 1,     -- 1 = active, 0 = deactivated
    is_registered       TINYINT(1)      NOT NULL DEFAULT 0,     -- 0 = pending, 1 = completed registration
    created_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME        DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
    last_login_at       DATETIME        DEFAULT NULL,
 
    -- --------------------------------------------------------
    -- Constraints
    -- --------------------------------------------------------
    PRIMARY KEY (EmpId),
    UNIQUE KEY uq_csat_users_email (Email)
 
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
 
