const packageService = require('./src/services/packageService');

async function testPackages() {
  try {
    console.log('测试获取所有套餐...');
    const packages = await packageService.getAllPackages(true);
    console.log(`找到 ${packages.length} 个套餐:\n`);
    
    packages.forEach((pkg, index) => {
      console.log(`套餐 ${index + 1}:`);
      console.log(`  ID: ${pkg.id}`);
      console.log(`  名称: ${pkg.name}`);
      console.log(`  显示名称: ${pkg.displayName}`);
      console.log(`  Badge: ${pkg.badge}`);
      console.log(`  描述: ${pkg.description}`);
      console.log(`  特性数量: ${pkg.features ? pkg.features.length : 0}`);
      console.log(`  特性:`, pkg.features);
      console.log('---');
    });
  } catch (error) {
    console.error('错误:', error);
  }
  process.exit(0);
}

testPackages();
