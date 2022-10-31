import React from 'react';

import { style } from "./const";

export default function ({tagName, defValue}) {
  return (
    <div style={style}>
      {`tagName = ${tagName}, 组件未正确配置namespace或version(当前配置: ${defValue || '未配置'}).`}
    </div>
  );
}
