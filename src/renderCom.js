import { render as renderUI } from "@mybricks/render-web";

export default function renderCom (json, opts, comDefs) {
  return new Promise((resolve) => {
    resolve(renderUI(json, Object.assign({
      env: {},
      comDefs
    }, opts || {})))
  });
}
