const fs = require("fs");
const pt = require("path");
const request = require('request');
const types = require("@babel/types");
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const generator = require("@babel/generator").default;

const { separator } = require("../const");
const { initComsDir, getCompleteDeps , getCloudComponentInfo } = require("../utils");

const pathPrefix = __dirname;

const { comsMapPath } = initComsDir(pathPrefix);

// 云组件代码
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
function getImportComsCode (deps) {
  let importComsCode = `
    import ErrorBoundary from "${ErrorBoundary}";
    import renderCom from "${renderCom}";
    const comDefs = {};\n
  `;

  deps.forEach(dep => {
    const {
      version,
      namespace,
      CloudComponentName,
      CloudComponentPath
    } = dep;

    importComsCode = importComsCode + `
      import ${CloudComponentName} from "${CloudComponentPath}";
      comDefs["${namespace}-${version}"] = {
        runtime: ${CloudComponentName}
      };\n
    `
  })

  return importComsCode;
}

// 全局组件信息
const globalImportComsMap = JSON.parse(fs.readFileSync(comsMapPath, "utf-8"));
const ErrorBoundary = pt.join(__dirname, "./MybricksCloudComponentErrorBoundary.jsx");
const renderCom = pt.join(__dirname, "./MybricksCloudComponentRenderCom.js");
const constFile = pt.join(__dirname, "./MybricksCloudComponentConst.js");
const ComponentDefError = pt.join(__dirname, "./MybricksCloudComponentDefError.jsx");

function errorComponent ({ComponentPath, tagName, namespace, version}) {
  fs.writeFileSync(ComponentPath, `
    import { style } from "${constFile}";

    export default function () {
      return <div style={style}>组件 (tagName = ${tagName}, namespace = ${namespace}, version = ${version}）未找到.</div>
    }
  `);
}

module.exports = async function (source, tagNameMap) {
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
            const { CloudComponentName, CloudComponentPath } = getCloudComponentInfo({tagName, version, namespace, pathPrefix});

            node.name.name = CloudComponentName;

            if (!importComsMap[comsMapKey]) {
              importComsMap[comsMapKey] = {
                tagName,
                version,
                namespace,
                CloudComponentName,
                CloudComponentPath
              };

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

  const deps = Object.keys(importComsMap).map((key) => {
    return importComsMap[key];
  });

  await componentLoad(deps);

  // 加载组件资源
  async function componentLoad (deps, isChild = false) {
    return new Promise((resolve, reject) => {
      Promise.all(deps.map(dep => {
        return new Promise((resolve, reject) => {
          const {
            tagName,
            version,
            namespace,
            CloudComponentName,
            CloudComponentPath
          } = dep;

          if (!globalImportComsMap[tagName]) {
            globalImportComsMap[tagName] = {};
          }

          const tagInfo = globalImportComsMap[tagName];

          if (!tagInfo[CloudComponentName]) {
            tagInfo[CloudComponentName] = {success: false, deps: []};
          }

          const ComponentInfo = tagInfo[CloudComponentName];
          const comApiParams = `namespace=${namespace}&version=${version}`;
          let comApi = tagNameMap[tagName].api;

          comApi = comApi + `${/\?/.test(comApi) ? "&" : "?"}${comApiParams}`;

          if (!ComponentInfo.success || !fs.existsSync(CloudComponentPath)) {
            console.log('加载资源', {tagName, namespace, version})
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
                let { deps, runtime } = data;

                let resultRuntime = runtime.trim();

                if (!Array.isArray(deps)) {
                  deps = []
                }

                ComponentInfo.deps = deps;
                ComponentInfo.success = true;

                const completeDeps = getCompleteDeps(deps, tagName, pathPrefix);

                // 区分组件入口
                if (!isChild) {
                  // TODO 未来搭建的组件应该只有源码？
                  if (resultRuntime.startsWith("function")) {
                    // 源码
                    resultRuntime = getImportComsCode(completeDeps) + resultRuntime.replace("function", "function RenderCom") + CloudComponentCode({namespace, version});
  
                    fs.writeFileSync(CloudComponentPath, resultRuntime);
                  } else {
                    // 非源码
                    const CloudComponentCodePath = pt.join(__dirname, `./com/${CloudComponentName}CompiledCode.js`);
                    fs.writeFileSync(pt.join(__dirname, CloudComponentCodePath), runtime);

                    const resultRuntime = `
                      import RenderCom from "${CloudComponentCodePath}";
                      ${getImportComsCode(completeDeps)}
                      ${CloudComponentCode({namespace, version})}
                    `;

                    fs.writeFileSync(CloudComponentPath, resultRuntime);
                  }
                } else {
                  fs.writeFileSync(CloudComponentPath, resultRuntime);
                }

                componentLoad(completeDeps, true).then(resolve);
              }
            })
          } else {
            console.log('资源已存在', {tagName, namespace, version})
            const { deps } = ComponentInfo;

            componentLoad(getCompleteDeps(deps, tagName, pathPrefix), true).then(resolve);
          }
        })
      })).then(resolve);
    });
  }

  let code = source;

  if (deps.length) {
    fs.writeFileSync(comsMapPath, JSON.stringify(globalImportComsMap));
    code = generator(sourceAst).code
  }

  return code;
}
