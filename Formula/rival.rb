class Rival < Formula
  desc "Rival CLI — manage and push function code to the Rival platform"
  homepage "https://rival.io"
  version "1.0.0"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/D-Cortex/rival-cli/releases/download/v#{version}/rival-macos-arm64"
      sha256 "b1ab42baa5a1aecdaa57b547405d3e953d228dca188c559b1159ec5bf28f49d2"

      def install
        bin.install "rival-macos-arm64" => "rival"
      end
    else
      url "https://github.com/D-Cortex/rival-cli/releases/download/v#{version}/rival-macos-x64"
      sha256 "14a4cf1b721d100adfc256b184a2dace5b26b4802f0415a9c23d756a5b1bbac3"

      def install
        bin.install "rival-macos-x64" => "rival"
      end
    end
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/rival --version")
  end
end
