let urls = [];
urls[0] = "https://api.artic.edu/api/v1/artworks/28560/manifest.json";
urls[1] = "https://api.artic.edu/api/v1/artworks/20684/manifest.json"
urls[2] = "https://api.artic.edu/api/v1/artworks/87479/manifest.json"
urls[3] = "https://api.artic.edu/api/v1/artworks/27992/manifest.json"
urls[4] = "https://api.artic.edu/api/v1/artworks/16568/manifest.json"
let images = [];
let desc = [];
settingClock();
resizeImage();
function resizeImage() {
  let carouselInner = document.getElementById("carouselInner");
  carouselInner.style.height = window.innerHeight+"px";
}
window.addEventListener("resize", resizeImage);

const arr = [0, 1, 2, 3, 4];

for (let i = arr.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  [arr[i], arr[j]] = [arr[j], arr[i]];
}
console.log(arr);

const myCarousel = document.getElementById('myCarousel')
myCarousel.addEventListener('slide.bs.carousel', function(event){
  let to = event.to;
  let image = document.getElementById(`img${to}`);
  if(image.src == "https://www.artic.edu/iiif/2/25c31d8d-21a4-9ea1-1d73-6a2eca4dda7e/full/843,/0/default.jpg"){
    fetch(urls[arr[to]])
    .then(response => response.json())
    .then(json => json.sequences)
    .then(sequences => sequences[0])
    .then(sequence => sequence.canvases)
    .then(canvases => canvases[0])
    .then(canvase => canvase.label)
    .then(label => {
      desc[arr[to]] = label;
    });
    fetch(urls[arr[to]])
    .then(response => response.json())
    .then(json => json.sequences)
    .then(sequences => sequences[0])
    .then(sequence => sequence.canvases)
    .then(canvases => canvases[0])
    .then(canvase => canvase.images)
    .then(images => images[0])
    .then(image => image.resource)
    .then(resource => resource["@id"])
    .then(url => {
      console.log(url);
      image.src= url;
    });
  }
})

//시계 위치 바꾸기
const clockElement = document.getElementById('clock');
const clockElement2 = document.getElementById('clock2');
clockElement.addEventListener("click",toggleMode);

// 시계 위치 바꾸는 모드인지 표시하는 변수
let clockPositionChangeMode= false;
function toggleMode(event){
    document.addEventListener('mousemove', moveClock);
    document.addEventListener('contextmenu',fixClock);
}
function fixClock(event){
  event.preventDefault();
  document.removeEventListener('mousemove', moveClock);
  document.removeEventListener('contextmenu',fixClock);
  clockElement.addEventListener("click",toggleMode);
}
function moveClock(event) {
  // 마우스 위치, 화면 크기 가져오기
  const mouseX = event.clientX;
  const mouseY = event.clientY;
  const windowX = window.innerWidth;
  const windowY = window.innerHeight;

  // 시계 위치 계산
  let positionX = mouseX/windowX * 100;
  let positionY = mouseY/windowY * 100;

  // 화면 크기별 보정 값
  let dy = 120/windowY*100;
  if(windowX<768){
    dy = 80/windowY*100;
  }
  // 시계 위치 이동
  clockElement.style.left = positionX + '%';
  clockElement.style.top = positionY + '%';
  clockElement2.style.left =  positionX + '%';
  clockElement2.style.top = positionY+dy+'%';
}

//화면 크기 변했을 때 시계 화면 중앙으로 이동
window.addEventListener('resize',function(event){
  // 화면 크기별 보정 값
  let dy;
  let windowX = window.innerWidth;
  let windowY = window.innerHeight;
  if(windowX<768){
    dy = 80/windowY*100;
  }else{
    dy = 120/windowY*100;
  }
  clockElement.style.left = 50 + '%';
  clockElement.style.top = 30 + '%';
  clockElement2.style.left =  50 + '%';
  clockElement2.style.top = 30+dy+'%';
})

function settingClock(){
  clock();
  setInterval(clock,1000);
}
function clock() {
  let target = document.getElementById("clock");
  let target2 = document.getElementById("clock2");
  let time = new Date(),
    month = time.getMonth(),
    date = time.getDate(),
    day = time.getDay(),
    week = ["일", "월", "화", "수", "목", "금", "토"],
    hours = time.getHours(),
    minutes = time.getMinutes();

  target.innerText = `${hours < 10 ? `0${hours}` : hours}:${minutes < 10 ? `0${minutes}` : minutes}`;
  target2.innerText = `${month + 1}월 ${date}일 ${week[day]}요일 `;
}