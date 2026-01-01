let myChart;
// ★ここにあなたのGASのウェブアプリURLを貼り付けてください
const gasUrl = "https://script.google.com/macros/s/AKfycbxFIfn0ZulBoKLKAt8kh_8jqbw4QLr7k_qPzGUP-ukBWbqRp9QDnxtM24QRTsCWgXvl/exec"; 

// ページ読み込み時の処理
window.addEventListener('DOMContentLoaded', async () => {
    initChart();
    await loadDataFromSheet();
});

// グラフの初期設定
function initChart() {
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
            maintainAspectRatio: true,
            scales: {
                y: { beginAtZero: true, max: 100 }
            }
        }
    });
}

// スプレッドシートからデータを取得してグラフを更新
async function loadDataFromSheet() {
    try {
        const response = await fetch(gasUrl);
        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();
        
        // グラフのデータを一度空にする
        myChart.data.labels = [];
        myChart.data.datasets[0].data = [];
        
        // シートのデータを日付順に反映
        data.forEach(item => {
            myChart.data.labels.push(item.date);
            myChart.data.datasets[0].data.push(item.score);
        });
        
        myChart.update();
    } catch (e) {
        console.error("データの読み込みに失敗しました:", e);
    }
}

// データの保存
async function saveLog() {
    const score = document.getElementById('score').value;
    const note = document.getElementById('note').value;
    const date = new Date().toLocaleDateString('ja-JP');

    // 送信ボタンを一時的に無効化（連打防止）
    const btn = document.querySelector('.btn-save');
    btn.disabled = true;
    btn.innerText = "SENDING...";

    try {
        await fetch(gasUrl, {
            method: "POST",
            mode: "no-cors",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ date, score, note })
        });
        
        alert("Success: クラウドに同期しました");
        document.getElementById('note').value = '';
        
        // 保存後、少し時間を置いてからグラフを再読み込み
        setTimeout(async () => {
            await loadDataFromSheet();
            btn.disabled = false;
            btn.innerText = "SEND TO CLOUD";
        }, 1500);

    } catch (e) {
        console.error(e);
        alert("保存に失敗しました。");
        btn.disabled = false;
        btn.innerText = "SEND TO CLOUD";
    }
}

function updateScoreVal(val) {
    document.getElementById('scoreVal').innerText = val;
}
