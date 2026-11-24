fn main() {
    // 화면 자료(../dist)가 바뀌면 실행 파일에 다시 넣는다.
    println!("cargo:rerun-if-changed=../dist");
    tauri_build::build()
}
