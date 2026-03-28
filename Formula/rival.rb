class Rival < Formula
  desc "Rival CLI — manage and push function code to the Rival platform"
  homepage "https://rival.io"
  version "1.0.0"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/D-Cortex/rival-cli/releases/download/v#{version}/rival-macos-arm64"
      sha256 "3e222bc2a06f6c286c0ffa9a7a748fc4d6266ceff22f798dd4eae42eb8bdefa4"

      def install
        bin.install "rival-macos-arm64" => "rival"
      end
    else
      url "https://github.com/D-Cortex/rival-cli/releases/download/v#{version}/rival-macos-x64"
      sha256 "484a7368ea367cdc89b982cf864466184d472cb5e4ca790c21ca889d23f613f4"

      def install
        bin.install "rival-macos-x64" => "rival"
      end
    end
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/rival --version")
  end
end
