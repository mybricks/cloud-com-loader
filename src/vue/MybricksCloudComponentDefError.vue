<script>
export default {
  props: ['tagName', 'defValue']
}
</script>

<template>
  <div style="font-size: 12px;color: #f5222d; overflow: hidden">
    tagName = {{tagName}}, 组件未正确配置namespace或version(当前配置: {{defValue || "未配置"}}).
  </div>
</template>
