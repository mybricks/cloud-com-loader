const fs = require("fs");
const path = require("path");
const request = require("request");
const compilerDOM = require("@vue/compiler-dom");

const { separator } = require("../const");
const { initComsDir, getCompleteDeps, getCloudComponentInfo } = require("../utils");

const pathPrefix = __dirname;
const { comsMapPath } = initComsDir(pathPrefix);

// 全局组件信息
const globalImportComsMap = JSON.parse(fs.readFileSync(comsMapPath, "utf-8"));
// const ErrorBoundary = path.join(__dirname, "./MybricksCloudComponentErrorBoundary.jsx");
const renderCom = path.join(__dirname, "./MybricksCloudComponentRenderCom.js");
// const constFile = path.join(__dirname, "./MybricksCloudComponentConst.js");
const ComponentDefError = path.join(__dirname, "./MybricksCloudComponentDefError.vue");

function errorComponent ({ComponentPath, tagName, namespace, version}) {
  fs.writeFileSync(ComponentPath, `
    <template>
      <div style="font-size: 12px;color: #f5222d; overflow: hidden">
        组件 (tagName = ${tagName}, namespace = ${namespace}, version = ${version}）未找到.
      </div>
    </template>
  `);
}


module.exports = async function (source, tagNameMap) {
  const sourceAst = compilerDOM.parse(source);
  const astChildren = sourceAst.children;
  const ScriptAst = astChildren.find(child => child.tag === "script" && child.props.find(p => p.name === 'setup'));
  const TempleteAst = astChildren.find(child => child.tag === "template");

  if (!TempleteAst) return source;

  // 存储需要拉取资源的组件
  const importComsMap = {};

  // script标签插入import内容
  let scriptImportStr = "";
  // 是否已导入一个Deferror组件
  let hasDefError = false;

  function defError (locSource, {tagName, defValue}) {
    // 是否已导入一个Deferror组件
    if (!hasDefError) {
      hasDefError = true;
      scriptImportStr = scriptImportStr + `import WebpackLoaderFangzhouCloudComponentDefError from "${ComponentDefError}"`;
    }

    console.log({tagName, defValue}, "{tagName, defValue}")

    source = source.replace(locSource, `<WebpackLoaderFangzhouCloudComponentDefError tagName="${tagName}" defValue="${defValue || "未配置"}" />`);
  }

  traverseTemplate(TempleteAst, {
    TagElement(node) {
      const { tag: tagName, props, loc } = node;
      // 配置
      const tagNameConfig = tagNameMap[tagName];

      if (tagNameConfig) {
        // 组件加载资源地址/def信息保留字段
        const { defKeyword } = tagNameConfig;
        const def = props.find(p => p.name === defKeyword);
        const locSource = loc.source;

        if (def) {
          // 有配置def
          // 值
          const defValue = def.value.content;
          // 标准def配置，需严格遵守。（例：xxxx@1.0.1）
          const [namespace, version] = defValue.split('@');

          if (namespace && version) {
            const comsMapKey = `${tagName}${separator}${defValue}`;
            const { CloudComponentName, CloudComponentPath } = getCloudComponentInfo({tagName, version, namespace, pathPrefix, fileType: "vue"});

            source = source.replace(locSource, locSource.replace(new RegExp(tagName, 'g'), CloudComponentName));

            if (!importComsMap[comsMapKey]) {
              importComsMap[comsMapKey] = {
                tagName,
                version,
                namespace,
                CloudComponentName,
                CloudComponentPath
              };

              scriptImportStr = scriptImportStr + `import ${CloudComponentName} from "${CloudComponentPath}"`;
            }
          } else {
            // def配置有误
            defError(locSource, {
              tagName,
              defValue
            });
          }
        } else {
          // 没有配置def，直接error即可
          defError(locSource, {
            tagName,
            defValue: ""
          });
        }
      }
    }
  })

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

                const completeDeps = getCompleteDeps(deps, tagName, pathPrefix, "vue");

                // 区分组件入口
                if (!isChild) {
                  // TODO 未来搭建的组件应该只有源码？
                  if (resultRuntime.startsWith("function")) {
                    // 源码
                    resultRuntime = getImportComsCode(completeDeps) + resultRuntime.replace("function", "function RenderCom");
  
                    fs.writeFileSync(CloudComponentPath, resultRuntime);
                  } else {
                    // 非源码
                    const CloudComponentCodePath = path.join(__dirname, `./com/${CloudComponentName}CompiledCode.js`);
                    fs.writeFileSync(path.join(__dirname, CloudComponentCodePath), runtime);

                    const resultRuntime = `
                      import RenderCom from "${CloudComponentCodePath}";
                      ${getImportComsCode(completeDeps)}
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

            componentLoad(getCompleteDeps(deps, tagName, pathPrefix, "vue"), true).then(resolve);
          }
        })
      })).then(resolve);
    });
  }

  const setUpScriptContent = ScriptAst?.children?.[0]?.content;

  if (setUpScriptContent) {
    source = source.replace(setUpScriptContent, `
      ${scriptImportStr}
      ${setUpScriptContent}
    `);
  } else {
    source = `
      <script setup>
        ${scriptImportStr}
      </script>
    ` + source;
  }
  
  return source;
}

function traverseTemplate(ast, opts) {
  const { TagElement } = opts;
  const { children } = ast;

  if (Array.isArray(children)) {
    children.forEach(child => {
      TagElement(child);
      traverseTemplate(child, opts);
    });
  }
}

// import 依赖组件
function getImportComsCode (deps) {
  let importComsCode = `
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
    `;
  });

  return `
  import React from "react";
  import { applyPureReactInVue } from "veaury";
  
  if (!window.React) {
    window.React = React;
  }

  ${importComsCode}
  
  export default applyPureReactInVue(function () {
    return React.createElement(RenderCom, {env: {
      renderCom: (json, opts) => {
        return new Promise((resolve) => {
          renderCom(json, opts, comDefs).then(resolve);
        })
      }
    }});
  });

  `;
}
