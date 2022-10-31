# @mybricks/cloud-com-loader
## webpack编译时动态加载云组件

### 1.安装
```javascript
npm i @mybricks/cloud-com-loader -D
```

### 2.配置
```javascript
{
  test: /\.(jsx|tsx)$/,
  use: [
    ...{...},
    {
      loader: "@mybricks/cloud-com-loader",
      options: {
        tagName: "Mytag",
        defKeyword: "mydef",
        api: "https://xxx/xxx"
      }
    }
  ]
}
```

### 3.使用云组件
```javascript
function App () {
  return (
    <Mytag
      mydef="test@1.0.0"
    />
  );
}
```
