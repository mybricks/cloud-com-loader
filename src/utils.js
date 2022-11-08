// @ts-check
const fs = require("fs");
const path = require("path");


/**
 * 初始化依赖组件文件夹
 * @param {string} pathPrefix 
 * @returns 
 */
function initComsDir (pathPrefix) {
  // 加载组件资源存储文件夹
  const comFolderPath = path.join(pathPrefix, "./com");
  // 全局组件信息
  const comsMapPath = path.join(pathPrefix, "./com/comsMap.json");

  // 不存在com文件夹
  if (!fs.existsSync(comFolderPath)) {
    // 创建com文件夹
    fs.mkdirSync(comFolderPath);
  }
  // 不存在comsMap文件
  if (!fs.existsSync(comsMapPath)) {
    // 创建comsMap文件
    fs.writeFileSync(comsMapPath, "{}");
  }

  return {
    comsMapPath,
    comFolderPath
  }
}

/**
 * 获取云组件文件名称和绝对路径
 * @param {*} param0 
 * @returns 
 */
function getCloudComponentInfo ({tagName, version, namespace, pathPrefix, fileType = "js"}) {
  const CloudComponentName = `MybricksCloudComponent${(tagName+namespace+version).replace(/@/g, "").replace(/\./g, "").replace(/-/g, "")}`;
  const CloudComponentFile = `./com/${CloudComponentName}.${fileType}`;
  const CloudComponentPath = path.join(pathPrefix, CloudComponentFile);

  return {
    CloudComponentPath,
    CloudComponentName
  };
}

/**
 * 获取依赖文件名称和绝对路径
 * @param {*} deps 
 * @param {*} tagName 
 * @param {*} pathPrefix 
 * @param {*} fileType 
 * @returns 
 */
function getCompleteDeps (deps, tagName, pathPrefix, fileType = "js") {
  if (Array.isArray(deps)) {
    return deps.map(dep => {
      const { namespace, version } = dep;

      return {
        tagName,
        version,
        namespace,
        ...getCloudComponentInfo({tagName, version, namespace, pathPrefix, fileType})
      }
    });
  }

  return [];
}

module.exports = {
  initComsDir,
  getCompleteDeps,
  getCloudComponentInfo
}
