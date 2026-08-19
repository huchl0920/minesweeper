const https = require('https');

function testDirectSearch(keyword) {
  return new Promise((resolve, reject) => {
    const url = 'https://www.momoshop.com.tw/search/' + encodeURIComponent(keyword);
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-TW,zh;q=0.9'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ keyword, status: res.statusCode, body: data }));
    }).on('error', reject);
  });
}

async function run() {
  const keywords = ['衛生紙', 'AirPods', 'Dyson', '洗髮精', 'Pixel 11', 'PS5'];
  for (const kw of keywords) {
    const res = await testDirectSearch(kw);
    const jsonLdMatch = res.body.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g);
    let count = 0;
    let sampleTitle = '';
    let sampleImg = '';
    let samplePrice = 0;
    if (jsonLdMatch) {
      try {
        const data = JSON.parse(jsonLdMatch[0].replace(/<script type="application\/ld\+json">/, '').replace(/<\/script>/, ''));
        const itemList = data['@graph'].find(g => g['@type'] === 'ItemList');
        if (itemList && itemList.itemListElement) {
          count = itemList.itemListElement.length;
          sampleTitle = itemList.itemListElement[0]?.name || '';
          sampleImg = itemList.itemListElement[0]?.image || '';
          samplePrice = itemList.itemListElement[0]?.offers?.price || 0;
        }
      } catch (e) {}
    }
    console.log(`[${kw}] -> Status: ${res.status}, Count: ${count}, Price: $${samplePrice}`);
    console.log(`   Title: ${sampleTitle}`);
    console.log(`   Image: ${sampleImg}\n`);
  }
}

run();
