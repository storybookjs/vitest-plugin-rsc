CREATE TABLE `todos` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `title` varchar(200) NOT NULL,
  `done` boolean NOT NULL DEFAULT false,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;
