class Rival < Formula
  desc "Rival CLI — manage and push function code to the Rival platform"
  homepage "https://rival.io"
  version "1.0.0"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/D-Cortex/rival-cli/releases/download/v#{version}/rival-macos-arm64"
      sha256 "98b5c1ce4553abc86f2d0a366be5ff0670b8065a1395af72f4b2c480fca99b1e"

      def install
        bin.install "rival-macos-arm64" => "rival"
      end
    else
      url "https://github.com/D-Cortex/rival-cli/releases/download/v#{version}/rival-macos-x64"
      sha256 "4c46ac12896d11ad97bcae097c9dce0b8b15b9b3530ad6374953b55b4e5e4f16"

      def install
        bin.install "rival-macos-x64" => "rival"
      end
    end
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/rival --version")
  end
end
