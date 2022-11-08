const { getOptions } = require("loader-utils");

const vueLoader = require("./vue");
const reactLoader = require("./react");

const loaderMap = {
  vue: vueLoader,
  react: reactLoader
};

async function loader (source) {
  const fileName = this.resourcePath.replace(this.context + "/", "");

  if (fileName.startsWith("MybricksCloudComponent")) {
    return source;
  }

  const loaderOptions = getOptions(this) || {};
  const { configs, type = "react" } = loaderOptions;

  // 未正确配置options
  if (!Array.isArray(configs) || !configs.length) {
    // TODO 更多的配置提示
    console.error("请正确配置options")
    return source;
  }

  const loaderType = type.trim().toLowerCase();
  // 标签名对应的配置
  const tagNameMap = {};

  configs.forEach(({tagName, defKeyword, api}) => {
    // 标签名称对应配置内容
    tagNameMap[tagName] = { defKeyword, api };
  });

  return loaderMap[loaderType]?.(source, tagNameMap) || source;
}

module.exports = loader
