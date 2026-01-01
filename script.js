let myChart; // グラフを保持する変数

// 1. グラフの初期化
window.addEventListener('DOMContentLoaded', () => {
    const ctx = document.getElementById('growthChart').getContext('2d');
    myChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Debug Score',
                data: [],
                borderColor: '#00d4ff',
                backgroundColor: 'rgba(0, 212, 255, 0.2)',
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true
        }
    });
    loadLocalData(); // グラフができてからデータを読み込む
});

// 2. データの保存
async function saveLog() {
    const score = document.getElementById('score').value;
    const note = document.getElementById('note').value;
    const date = new Date().toLocaleDateString('ja-JP');

    // グラフ更新
    myChart.data.labels.push(date);
    myChart.data.datasets[0].data.push(score);
    myChart.update();
    
    // ローカル保存
    const data = { labels: myChart.data.labels, scores: myChart.data.datasets[0].data };
    localStorage.setItem('dailyDebugData', JSON.stringify(data));

    // スプレッドシート送信 (URLを取得したら書き換えてください)
    const gasUrl = "https://script.google.com/macros/s/AKfycbzrzqwQQ4fvMd-4LMOi-gpMme5xYRywDDUiav1895VmN-tBkOV2BlEBRNUZ_HYLymLF/exec"; 
    
    try {
        await fetch(gasUrl, {
            method: "POST",
            mode: "no-cors",
            body: JSON.stringify({ date, score, note })
        });
        alert("Success: クラウドに同期しました");
    } catch (e) {
        console.log("Offline: ローカルにのみ保存されました");
    }
}

function loadLocalData() {
    const saved = localStorage.getItem('dailyDebugData');
    if (saved && myChart) {
        const data = JSON.parse(saved);
        myChart.data.labels = data.labels || [];
        myChart.data.datasets[0].data = data.scores || [];
        myChart.update();
    }
}

function updateScoreVal(val) {
    document.getElementById('scoreVal').innerText = val;
}