// Репозиторий: `shared/` лежит на уровень выше `mobile/`. Metro по умолчанию не резолвит
// модули вне projectRoot без watchFolders — иначе падает импорт `shared/contactChannels`
// (после babel module-resolver часто получается относительный путь вроде ../../../shared/...).
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(projectRoot);

const existingWatch = config.watchFolders ?? [];
if (!existingWatch.includes(workspaceRoot)) {
  config.watchFolders = [...existingWatch, workspaceRoot];
}

module.exports = config;
