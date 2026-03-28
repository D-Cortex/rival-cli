class Rival < Formula
  desc "Rival CLI — manage and push function code to the Rival platform"
  homepage "https://rival.io"
  version "1.0.0"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/D-Cortex/rival-cli/releases/download/v#{version}/rival-macos-arm64"
      sha256 "b512c41fedb69fccea677b40009e79a7fbf55b3245fa7c6466e6e8b164c09f6f"

      def install
        bin.install "rival-macos-arm64" => "rival"
      end
    else
      url "https://github.com/D-Cortex/rival-cli/releases/download/v#{version}/rival-macos-x64"
      sha256 "7443b5d174161e35f5a993939f06bf0f90a7812865a99c7ef615063cad6e5455"

      def install
        bin.install "rival-macos-x64" => "rival"
      end
    end
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/rival --version")
  end
end
