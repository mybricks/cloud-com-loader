const fs = require("fs");
const pt = require("path");
var request = require('request');
const types = require("@babel/types");
const parser = require("@babel/parser");
const { getOptions } = require("loader-utils");
const traverse = require("@babel/traverse").default;
const generator = require("@babel/generator").default;

// 加载组件资源存储文件夹
const comFolderPath = pt.join(__dirname, "./com");
// 全局组件信息
const comsMapPath = pt.join(__dirname, "./com/comsMap.json");
// 分割符
const separator = "&&**";

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

function CloudComponentCode ({namespace, version}) {
  return `
export default function () {
  return (
    <ErrorBoundary namespace="${namespace}" version="${version}">
      <RenderCom
        env={{
          renderCom: (json, opts) => {
            return new Promise((resolve) => {
              renderCom(json, opts, comDefs).then(resolve);
            })
          }
        }}
      />
    </ErrorBoundary>
  )
}
`
};

// import 依赖组件
function getImportComsCode (deps, tagName) {
  let importComsCode = `
    import ErrorBoundary from "${ErrorBoundary}";
    import renderCom from "${renderCom}";
    const comDefs = {};\n
  `;

  if (Array.isArray(deps)) {
    deps.forEach(dep => {
      const { namespace, version } = dep;
      const CloudComponentName = `CloudComponent${tagName}${namespace}${version}`.replace(/@/g, "").replace(/\./g, "").replace(/-/g, "");
      const CloudComponentFile = `./com/${CloudComponentName}.js`;
      const CloudComponentPath = pt.join(__dirname, CloudComponentFile);

      importComsCode = importComsCode + `
        import ${CloudComponentName} from "${CloudComponentPath}";
        comDefs["${namespace}-${version}"] = {
          runtime: ${CloudComponentName}
        };\n
      `
    })
  }

  return importComsCode;
}

// 全局组件信息
const globalImportComsMap = JSON.parse(fs.readFileSync(comsMapPath, "utf-8"));
const ErrorBoundary = pt.join(__dirname, "./ErrorBoundary.jsx");
const renderCom = pt.join(__dirname, "./renderCom.js");
const constFile = pt.join(__dirname, "./const.js");
const ComponentDefError = pt.join(__dirname, "./ComponentDefError.jsx");

function errorComponent ({ComponentPath, tagName, namespace, version}) {
  fs.writeFileSync(ComponentPath, `
    import { style } from "${constFile}";

    export default function () {
      return <div style={style}>组件 (tagName = ${tagName}, namespace = ${namespace}, version = ${version}）未找到.</div>
    }
  `);
}

async function loader (source) {
  const loaderOptions = getOptions(this) || {};
  const { configs } = loaderOptions;

  // 未正确配置options
  if (!Array.isArray(configs) || !configs.length) {
    // TODO 更多的配置提示
    console.error("请正确配置options")
    return source;
  }

  // 标签名对应的配置
  const tagNameMap = {};

  configs.forEach(({tagName, defKeyword, api}) => {
    // 标签名称对应配置内容
    tagNameMap[tagName] = { defKeyword, api };
  });

  // 解析代码->ast
  const sourceAst = parser.parse(source, {
    sourceType: "unambiguous",
    plugins: ["jsx", "typescript"]
  });

  // 存储需要拉取资源的组件
  const importComsMap = {};

  let hasDefError = false;

  function defError (node, {tagName, defValue}, sourceAst) {
    // 是否已导入一个Deferror组件
    if (!hasDefError) {
      hasDefError = true;

      sourceAst.program.body.unshift(
        types.importDeclaration(
          [types.importDefaultSpecifier(
            types.identifier("WebpackLoaderFangzhouCloudComponentDefError")
          )],
          types.stringLiteral(ComponentDefError)
        )
      )
    }

    // 使用deferror组件
    node.attributes.push(
      // 设置props
      types.jsxAttribute(types.JSXIdentifier("tagName"), types.StringLiteral(tagName)),
      types.jsxAttribute(types.JSXIdentifier("defValue"), types.StringLiteral(defValue))
    );
    // 设置标签名
    node.name.name = "WebpackLoaderFangzhouCloudComponentDefError";
  }

  // 遍历ast树
  traverse(sourceAst, {
    // jsx元素
    JSXOpeningElement(path) {
      // 当前节点
      const node = path.node;
      // 标签名称
      const tagName = node.name.name;
      // 属性
      const attributes = node.attributes;
      // 配置
      const tagNameConfig = tagNameMap[tagName];

      if (tagNameConfig) {
        // 组件加载资源地址/def信息保留字段
        const { defKeyword } = tagNameConfig;
        const def = attributes.find(attribute => attribute.name.name === defKeyword);

        if (def) {
          // 有配置def
          // 值
          const defValue = def.value.value;

          // 标准def配置，需严格遵守。（例：xxxx@1.0.1）
          const [namespace, version] = defValue.split('@');

          if (namespace && version) {
            const comsMapKey = `${tagName}${separator}${defValue}`;
            const CloudComponentName = `CloudComponent${(tagName+defValue).replace(/@/g, "").replace(/\./g, "").replace(/-/g, "")}`;
            const CloudComponentFile = `./com/${CloudComponentName}.js`;
            const CloudComponentPath = pt.join(__dirname, CloudComponentFile);

            node.name.name = CloudComponentName;

            if (!importComsMap[comsMapKey]) {
              importComsMap[comsMapKey] = true;

              sourceAst.program.body.unshift(
                types.importDeclaration(
                  [types.importDefaultSpecifier(
                    types.identifier(CloudComponentName)
                  )],
                  types.stringLiteral(CloudComponentPath)
                )
              );
            }
          } else {
            // def配置有误
            defError(node, {
              tagName,
              defValue
            }, sourceAst);
          }
        } else {
          // 没有配置def，直接error即可
          defError(node, {
            tagName,
            defValue: ""
          }, sourceAst);
        }
      }
    }
  });

  const importComKeys = Object.keys(importComsMap);

  await componentLoad(importComKeys);

  // 加载组件资源
  async function componentLoad (comKeys, isChild = false) {
    return new Promise((resolve, reject) => {
      Promise.all(comKeys.map(comKey => {
        return new Promise((resolve, reject) => {
          const [tagName, defValue] = comKey.split(separator);
          const [namespace, version] = defValue.split("@");
          const CloudComponentName = `CloudComponent${(tagName+defValue).replace(/@/g, "").replace(/\./g, "").replace(/-/g, "")}`;

          if (!globalImportComsMap[tagName]) {
            globalImportComsMap[tagName] = {};
          }

          const tagInfo = globalImportComsMap[tagName];

          if (!tagInfo[CloudComponentName]) {
            tagInfo[CloudComponentName] = {success: false, deps: []};
          }

          const ComponentInfo = tagInfo[CloudComponentName];
          const CloudComponentFile = `./com/${CloudComponentName}.js`;
          const CloudComponentPath = pt.join(__dirname, CloudComponentFile);
          const comApiParams = `namespace=${namespace}&version=${version}`;
          let comApi = tagNameMap[tagName].api;

          comApi = comApi + `${/\?/.test(comApi) ? "&" : "?"}${comApiParams}`;

          if (!ComponentInfo.success || !fs.existsSync(CloudComponentPath)) {
            console.log('加载资源', {tagName, defValue})
            // 加载
            request(comApi, function (error, response, body) {
              if (response.statusCode !== 200) {
                errorComponent({
                  ComponentPath: CloudComponentPath,
                  tagName,
                  namespace,
                  version
                });
                resolve(true);
              } else {
                const rst = JSON.parse(body);
                const data = rst.data;
                // 依赖组件数组/运行时代码
                const { deps, runtime } = data;

                let resultRuntime = runtime.trim();

                ComponentInfo.deps = deps;
                ComponentInfo.success = true;

                // 区分组件入口
                if (!isChild) {
                  // TODO 未来搭建的组件应该只有源码？
                  if (resultRuntime.startsWith("function")) {
                    // 源码
                    resultRuntime = getImportComsCode(deps, tagName) + resultRuntime.replace("function", "function RenderCom") + CloudComponentCode({namespace, version});
  
                    fs.writeFileSync(CloudComponentPath, resultRuntime);
                  } else {
                    // 非源码
                    const CloudComponentCodePath = pt.join(__dirname, `./com/${CloudComponentName}CompiledCode.js`);
                    fs.writeFileSync(pt.join(__dirname, CloudComponentCodePath), runtime);

                    const resultRuntime = `
                      import RenderCom from "${CloudComponentCodePath}";
                      ${getImportComsCode(deps, tagName)}
                      ${CloudComponentCode({namespace, version})}
                    `;

                    fs.writeFileSync(CloudComponentPath, resultRuntime);
                  }
                } else {
                  fs.writeFileSync(CloudComponentPath, resultRuntime);
                }

                const comKeys = Array.isArray(deps) ? deps.map(({namespace, version}) => {
                  return `${tagName}${separator}${namespace}@${version}`;
                }) : [];

                componentLoad(comKeys, true).then(resolve);
              }
            })
          } else {
            console.log('资源已存在', {tagName, defValue})
            const { deps } = ComponentInfo;

            const comKeys = Array.isArray(deps) ? deps.map(({namespace, version}) => {
              return `${tagName}${separator}${namespace}@${version}`;
            }) : [];

            componentLoad(comKeys, true).then(resolve);
          }
        })
      })).then(resolve);
    });
  }

  if (importComKeys.length) {
    fs.writeFileSync(comsMapPath, JSON.stringify(globalImportComsMap));
  }

  return generator(sourceAst).code;
}

module.exports = loader
